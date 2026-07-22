import { describe, expect, it } from "vitest";
import { createJournalSessionController } from "../../../application/journal/journalSessionController";
import type {
  BuiltInLocalDraftRevision,
  JournalRepository,
} from "../../../application/repository/builtInRepository";
import type {
  JournalRevisionDto,
} from "../../../contracts/journal/types";
import type { JournalContent } from "../../../core/journal/model/journalContent";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntries,
} from "../../journal/journalTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

const remoteRevision = (character: string) =>
  `sha256:${character.repeat(64)}` as JournalRevisionDto;
const localRevision = (suffix: string) =>
  `draft:00000000-0000-4000-8000-${suffix.padStart(12, "0")}` as BuiltInLocalDraftRevision;

function emptyJournal(): JournalContent {
  return createEmptyJournalContent();
}

function appendJournalEntry(
  current: JournalContent,
  index: number,
): JournalContent {
  return appendJournalTestEntry(current, {
    blockIdStart: index * 10,
    createdAt: `2026-07-17T16:00:0${index}.000Z`,
    entryIndex: index,
  });
}

async function settleLoad() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("versioned Journal session controller", () => {
  it("keeps functional mutations optimistic while deferred stages serialize", async () => {
    const firstStage = deferred<{ localRevision: BuiltInLocalDraftRevision }>();
    const staged: JournalContent[] = [];
    let stageCount = 0;
    const repository: JournalRepository = {
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
        databaseName: "cognition-tree.journal",
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
    const controller = createJournalSessionController(
      repository,
      testApplicationScheduler,
    );
    const visibleLengths: number[] = [];

    controller.subscribe(() => {
      const state = controller.getState();
      if (state.status === "ready") {
        visibleLengths.push(journalEntries(state.content).length);
      }
    });
    controller.start();
    await settleLoad();

    controller.updateContent((current) => appendJournalEntry(current, 1));
    controller.updateContent((current) => appendJournalEntry(current, 2));

    const optimistic = controller.getState();
    expect(optimistic.status).toBe("ready");
    expect(optimistic.status === "ready"
      ? journalEntries(optimistic.content).map(({ sequence }) => sequence)
      : []).toEqual([1, 2]);

    const flush = controller.flushPendingChanges();
    firstStage.resolve({ localRevision: localRevision("1") });
    await flush;

    expect(staged.map((content) => journalEntries(content).length)).toEqual([1, 2]);
    const firstOptimisticIndex = visibleLengths.indexOf(2);
    expect(firstOptimisticIndex).toBeGreaterThanOrEqual(0);
    expect(visibleLengths.slice(firstOptimisticIndex)).not.toContain(1);
    controller.stop();
  });

  it("flushes desired content before a ready-session reload", async () => {
    const stage = deferred<{ localRevision: BuiltInLocalDraftRevision }>();
    let stored = emptyJournal();
    let loadCount = 0;
    const repository: JournalRepository = {
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
        databaseName: "cognition-tree.journal",
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
    const controller = createJournalSessionController(
      repository,
      testApplicationScheduler,
    );

    controller.start();
    await settleLoad();
    controller.updateContent((current) => appendJournalEntry(current, 1));
    const reload = controller.reload();

    await Promise.resolve();
    expect(loadCount).toBe(1);
    stage.resolve({ localRevision: localRevision("1") });
    await reload;

    expect(loadCount).toBe(2);
    const state = controller.getState();
    expect(state.status === "ready"
      ? journalEntries(state.content).length
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
    const expectedRevisions: BuiltInLocalDraftRevision[] = [];
    const repository: JournalRepository = {
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
        databaseName: "cognition-tree.journal",
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
    const controller = createJournalSessionController(
      repository,
      testApplicationScheduler,
    );
    const append = (index: number) => (current: JournalContent) => {
      return appendJournalEntry(current, index);
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
