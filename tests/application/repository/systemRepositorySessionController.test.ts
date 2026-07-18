import { describe, expect, it } from "vitest";
import { createSystemRepositorySessionController } from "../../../src/application/repository/systemRepositorySessionController";
import type {
  SystemLocalDraftRevision,
  SystemRepository,
  SystemRepositoryContent,
  SystemRepositoryRevision,
} from "../../../src/storage/repository/systemRepository";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

const remoteRevision = (character: string) =>
  `sha256:${character.repeat(64)}` as SystemRepositoryRevision;
const localRevision = (suffix: string) =>
  `draft:00000000-0000-4000-8000-${suffix.padStart(12, "0")}` as SystemLocalDraftRevision;

function journalEntry(index: number) {
  return {
    createdAt: `2026-07-18T00:00:0${index}.000Z`,
    id: `journal-entry-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source: `entry ${index}`,
    timezoneOffsetMinutes: 480,
    updatedAt: `2026-07-18T00:00:0${index}.000Z`,
  };
}

function emptyJournal(): SystemRepositoryContent {
  return { entries: [], purpose: "system-journal", schemaVersion: 1 };
}

async function settleLoad() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("system repository session controller", () => {
  it("keeps functional mutations optimistic while deferred stages serialize", async () => {
    const firstStage = deferred<{ localRevision: SystemLocalDraftRevision }>();
    const staged: SystemRepositoryContent[] = [];
    let stageCount = 0;
    const repository: SystemRepository = {
      discardPendingSnapshotAndReload: async () => ({
        conflictRevision: null,
        content: emptyJournal(),
        localRevision: localRevision("9"),
        pendingChanges: false,
        remoteRevision: remoteRevision("a"),
      }),
      label: "日记",
      loadSnapshot: async () => ({
        conflictRevision: null,
        content: emptyJournal(),
        localRevision: localRevision("0"),
        pendingChanges: false,
        remoteRevision: remoteRevision("a"),
      }),
      location: {
        databaseName: "cognition-tree.system-repositories",
        type: "browser",
      },
      async stageSnapshot({ content }) {
        stageCount += 1;
        staged.push(structuredClone(content));
        return stageCount === 1
          ? firstStage.promise
          : { localRevision: localRevision(String(stageCount)) };
      },
      subscribeReconnect: () => () => undefined,
      async synchronizePendingSnapshot() {
        return {
          localRevision: localRevision(String(stageCount)),
          pendingChanges: false,
          remoteRevision: remoteRevision("b"),
          status: "synced",
        };
      },
    };
    const controller = createSystemRepositorySessionController({
      purpose: "system-journal",
      repository,
    });
    const visibleLengths: number[] = [];

    controller.subscribe(() => {
      const state = controller.getState();
      if (state.status === "ready" && state.content.purpose === "system-journal") {
        visibleLengths.push(state.content.entries.length);
      }
    });
    controller.start();
    await settleLoad();

    controller.updateContent((current) => ({
      ...current,
      entries: current.purpose === "system-journal"
        ? [...current.entries, journalEntry(1)]
        : [],
      purpose: "system-journal",
    }));
    controller.updateContent((current) => ({
      ...current,
      entries: current.purpose === "system-journal"
        ? [...current.entries, journalEntry(2)]
        : [],
      purpose: "system-journal",
    }));

    const optimistic = controller.getState();
    expect(optimistic.status).toBe("ready");
    expect(optimistic.status === "ready" &&
      optimistic.content.purpose === "system-journal"
      ? optimistic.content.entries.map(({ source }) => source)
      : []).toEqual(["entry 1", "entry 2"]);

    const flush = controller.flushPendingChanges();
    firstStage.resolve({ localRevision: localRevision("1") });
    await flush;

    expect(staged.map((content) =>
      content.purpose === "system-journal" ? content.entries.length : -1
    )).toEqual([1, 2]);
    const firstOptimisticIndex = visibleLengths.indexOf(2);
    expect(firstOptimisticIndex).toBeGreaterThanOrEqual(0);
    expect(visibleLengths.slice(firstOptimisticIndex)).not.toContain(1);
    controller.stop();
  });

  it("flushes desired content before a ready-session reload", async () => {
    const stage = deferred<{ localRevision: SystemLocalDraftRevision }>();
    let stored = emptyJournal();
    let loadCount = 0;
    const repository: SystemRepository = {
      discardPendingSnapshotAndReload: async () => {
        throw new Error("not used");
      },
      label: "日记",
      async loadSnapshot() {
        loadCount += 1;
        return {
          conflictRevision: null,
          content: structuredClone(stored),
          localRevision: localRevision(String(loadCount - 1)),
          pendingChanges: loadCount > 1,
          remoteRevision: remoteRevision("a"),
        };
      },
      location: {
        databaseName: "cognition-tree.system-repositories",
        type: "browser",
      },
      async stageSnapshot({ content }) {
        await stage.promise;
        stored = structuredClone(content);
        return { localRevision: localRevision("1") };
      },
      subscribeReconnect: () => () => undefined,
      async synchronizePendingSnapshot() {
        return {
          localRevision: localRevision("1"),
          pendingChanges: false,
          remoteRevision: remoteRevision("b"),
          status: "synced",
        };
      },
    };
    const controller = createSystemRepositorySessionController({
      purpose: "system-journal",
      repository,
    });

    controller.start();
    await settleLoad();
    controller.updateContent((current) => ({
      ...current,
      entries: [journalEntry(1)],
      purpose: "system-journal",
    }));
    const reload = controller.reload();

    await Promise.resolve();
    expect(loadCount).toBe(1);
    stage.resolve({ localRevision: localRevision("1") });
    await reload;

    expect(loadCount).toBe(2);
    const state = controller.getState();
    expect(state.status === "ready" &&
      state.content.purpose === "system-journal"
      ? state.content.entries.length
      : -1).toBe(1);
    controller.stop();
  });

  it("drains an active remote sync before reload installs a new queue", async () => {
    const releaseSync = deferred<void>();
    const syncStarted = deferred<void>();
    let storedContent = emptyJournal();
    let storedLocalRevision = localRevision("0");
    let pendingChanges = false;
    let loadCount = 0;
    let stageCount = 0;
    const expectedRevisions: SystemLocalDraftRevision[] = [];
    const repository: SystemRepository = {
      discardPendingSnapshotAndReload: async () => {
        throw new Error("not used");
      },
      label: "日记",
      async loadSnapshot() {
        loadCount += 1;
        return {
          conflictRevision: null,
          content: structuredClone(storedContent),
          localRevision: storedLocalRevision,
          pendingChanges,
          remoteRevision: remoteRevision("a"),
        };
      },
      location: {
        databaseName: "cognition-tree.system-repositories",
        type: "browser",
      },
      async stageSnapshot({ content, expectedLocalRevision }) {
        expectedRevisions.push(expectedLocalRevision);
        stageCount += 1;
        storedContent = structuredClone(content);
        storedLocalRevision = localRevision(String(stageCount));
        pendingChanges = true;
        return { localRevision: storedLocalRevision };
      },
      subscribeReconnect: () => () => undefined,
      async synchronizePendingSnapshot() {
        syncStarted.resolve();
        await releaseSync.promise;
        return {
          localRevision: storedLocalRevision,
          pendingChanges,
          remoteRevision: remoteRevision("b"),
          status: "synced",
        };
      },
    };
    const controller = createSystemRepositorySessionController({
      purpose: "system-journal",
      repository,
    });
    const append = (index: number) => (current: SystemRepositoryContent) => {
      if (current.purpose !== "system-journal") {
        throw new Error("unexpected purpose");
      }
      return { ...current, entries: [...current.entries, journalEntry(index)] };
    };

    controller.start();
    await settleLoad();
    controller.updateContent(append(1));
    await controller.flushPendingChanges();
    controller.requestSync();
    await syncStarted.promise;
    controller.updateContent(append(2));
    await controller.flushPendingChanges();

    const reload = controller.reload();

    await Promise.resolve();
    expect(loadCount).toBe(1);
    releaseSync.resolve();
    await reload;
    expect(loadCount).toBe(2);

    controller.updateContent(append(3));
    await controller.flushPendingChanges();
    expect(expectedRevisions).toEqual([
      localRevision("0"),
      localRevision("1"),
      localRevision("2"),
    ]);
    controller.stop();
  });
});
