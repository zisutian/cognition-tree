// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchController,
  type WorkbenchController,
  type WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type {
  BuiltInCatalog,
  BuiltInDescriptor,
} from "../../../application/repository/builtInCatalog";
import type {
  JournalLocalDraftRevision,
  JournalRepositoryProvider,
  JournalRevision,
  JournalRepository,
} from "../../../application/journal/persistence/journalRepository";
import type {
  TodoRepositoryProvider,
  TodoRepository,
} from "../../../application/todo/persistence/todoRepository";
import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../application/workspace/persistence/workspaceRepository";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../../../application/repository/workspaceRepositoryCatalog";
import { createEmptyJournalContent } from "../../core/journal/journalTestFixture";
import { createEmptyTodoContent } from "../../core/todo/todoTestFixture";
import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import { createTodoParseIndex } from "../../../core/todo/indexes/todoParseIndex";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
  replaceEditableSource,
} from "../workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";
import type {
  DomainChangeNotification,
} from "../../../application/sync/domainChangeEvents";
import type {
  VersionedRepository,
} from "../../../application/persistence/versionedRepository";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

const workspaceDescriptors: WorkspaceRepositoryDescriptor[] = [
  {
    id: "repository-a",
    label: "仓库A",
    labelIssue: null,
    location: {
      hostPath: null,
      serverPath: "/repositories/a",
    },
  },
  {
    id: "repository-b",
    label: "仓库B",
    labelIssue: null,
    location: {
      hostPath: null,
      serverPath: "/repositories/b",
    },
  },
];

const builtInDescriptors: BuiltInDescriptor[] = [
  {
    id: "journal",
    label: "日记",
    location: { serverPath: "/data/journal", type: "server" },
    protected: true,
  },
  {
    id: "todo",
    label: "代办",
    location: { serverPath: "/data/todo", type: "server" },
    protected: true,
  },
];

const builtInRevision = (character: string) =>
  `sha256:${character.repeat(64)}` as JournalRevision;
const builtInDraft = (suffix: string) =>
  `draft:00000000-0000-4000-8000-${suffix.padStart(12, "0")}` as
    JournalLocalDraftRevision;

function createBuiltInRepository<Content, Projection>(
  label: string,
  content: Content,
  location: BuiltInDescriptor["location"],
  projection: Projection,
): VersionedRepository<
  Content,
  `sha256:${string}`,
  `draft:${string}`,
  BuiltInDescriptor["location"],
  Projection
> {
  let localRevisionIndex = 0;
  let snapshot = {
    conflictRevision: null,
    content,
    localRevision: builtInDraft("0"),
    pendingChanges: false,
    projection,
    remoteRevision: builtInRevision("a"),
  };

  return {
    discardPendingSnapshotAndReload: async () => {
      snapshot = {
        ...snapshot,
        content,
        localRevision: builtInDraft("9"),
        pendingChanges: false,
        projection,
        remoteRevision: builtInRevision("b"),
      };
      return snapshot;
    },
    keepLocalConflictAndSynchronize: async () => {
      throw new Error("Unexpected built-in conflict resolution in workbench test.");
    },
    label,
    loadConflict: async () => null,
    loadSnapshot: async () => snapshot,
    location,
    resolveConflictAndSynchronize: async () => {
      throw new Error("Unexpected built-in conflict resolution in workbench test.");
    },
    stageSnapshot: async (change) => {
      const previousLocalRevision = snapshot.localRevision;

      snapshot = {
        conflictRevision: null,
        content: change.after.content,
        localRevision: builtInDraft(`${localRevisionIndex += 1}`),
        pendingChanges: true,
        projection: change.after.projection,
        remoteRevision: snapshot.remoteRevision,
      };
      return { previousLocalRevision, snapshot };
    },
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => {
      const previousLocalRevision = snapshot.localRevision;

      snapshot = {
        ...snapshot,
        conflictRevision: null,
        pendingChanges: false,
        remoteRevision: builtInRevision("b"),
      };
      return {
        status: "synced" as const,
        transitions: [{ previousLocalRevision, snapshot }],
      };
    },
  };
}

function createWorkspaceRepository(
  descriptor: WorkspaceRepositoryDescriptor,
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshot>,
): WorkspaceRepository {
  let currentSnapshot: WorkspaceRepositorySnapshot | null = null;
  let localRevisionIndex = 0;
  const readSnapshot = async () => {
    currentSnapshot = await loadSnapshot();
    return currentSnapshot;
  };

  return {
    discardPendingSnapshotAndReload: readSnapshot,
    keepLocalConflictAndSynchronize: async () => {
      throw new Error("Unexpected workspace conflict resolution in workbench test.");
    },
    label: descriptor.label,
    loadConflict: async () => null,
    loadSnapshot: readSnapshot,
    location: descriptor.location,
    resolveConflictAndSynchronize: async () => {
      throw new Error("Unexpected workspace conflict resolution in workbench test.");
    },
    stageSnapshot: async (change) => {
      const before = currentSnapshot ?? await readSnapshot();
      const snapshot = {
        ...before,
        content: change.after.content,
        localRevision: draftRevision(`next-${localRevisionIndex += 1}`),
        pendingChanges: true,
        projection: change.after.projection,
      };

      currentSnapshot = snapshot;
      return { previousLocalRevision: before.localRevision, snapshot };
    },
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => {
      const before = currentSnapshot ?? await readSnapshot();
      const snapshot = {
        ...before,
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
      };

      currentSnapshot = snapshot;
      return {
        status: "synced",
        transitions: [{
          previousLocalRevision: before.localRevision,
          snapshot,
        }],
      };
    },
  };
}

function waitForSnapshot(
  controller: WorkbenchController,
  predicate: (snapshot: WorkbenchControllerSnapshot) => boolean,
) {
  if (predicate(controller.getSnapshot())) {
    return Promise.resolve(controller.getSnapshot());
  }
  return new Promise<WorkbenchControllerSnapshot>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot();

      if (predicate(snapshot)) {
        unsubscribe();
        resolve(snapshot);
      }
    });
  });
}

function createHarness({
  repositoryBLoad,
  withChangeEvents = false,
}: {
  repositoryBLoad?: () => Promise<WorkspaceRepositorySnapshot>;
  withChangeEvents?: boolean;
} = {}) {
  let activeRepositoryId: string | null = "repository-a";
  const events: string[] = [];
  const repositories = new Map<string, WorkspaceRepository>([
    [
      "repository-a",
      createWorkspaceRepository(
        workspaceDescriptors[0],
        async () => createSnapshot({ content: createContent("仓库A", "A") }),
      ),
    ],
    [
      "repository-b",
      createWorkspaceRepository(
        workspaceDescriptors[1],
        repositoryBLoad ??
          (async () => createSnapshot({ content: createContent("仓库B", "B") })),
      ),
    ],
  ]);
  const workspaceCatalog: WorkspaceRepositoryCatalog = {
    deleteRepository: vi.fn(async () => undefined),
    label: "Repositories",
    listRepositories: vi.fn(async () => ({
      issues: [],
      repositories: workspaceDescriptors,
    })),
    renameRepository: vi.fn(),
  };
  const workspaceRepositories = {
    createRepository: vi.fn(),
    openRepository(descriptor: WorkspaceRepositoryDescriptor) {
      events.push(`open:${descriptor.id}`);
      return repositories.get(descriptor.id)!;
    },
  };
  const journalRepository: JournalRepository = createBuiltInRepository(
    "日记",
    createEmptyJournalContent(),
    builtInDescriptors[0].location,
    createJournalParseIndex(createEmptyJournalContent()),
  );
  const todoRepository: TodoRepository = createBuiltInRepository(
    "代办",
    createEmptyTodoContent(),
    builtInDescriptors[1].location,
    createTodoParseIndex(createEmptyTodoContent()),
  );
  const builtInCatalog: BuiltInCatalog = {
    label: "Built-ins",
    listBuiltIns: vi.fn(async () => ({
      issues: [],
      repositories: builtInDescriptors,
    })),
    retry: vi.fn(async () => ({ status: "ready" as const })),
  };
  const journalRepositories: JournalRepositoryProvider = {
    openJournal: () => journalRepository,
  };
  const todoRepositories: TodoRepositoryProvider = {
    openTodo: () => todoRepository,
  };
  const changeListeners = new Set<
    (event: DomainChangeNotification) => void
  >();
  const disposeChangeEvents = vi.fn();
  const startChangeEvents = vi.fn();
  const controller = createWorkbenchController({
    activeRepositorySelection: {
      clear: () => {
        activeRepositoryId = null;
      },
      load: () => activeRepositoryId,
      save: (repositoryId) => {
        events.push(`select:${repositoryId}`);
        activeRepositoryId = repositoryId;
      },
    },
    apiAccessAdministration: {} as Parameters<
      typeof createWorkbenchController
    >[0]["apiAccessAdministration"],
    operationAdministration: {} as Parameters<
      typeof createWorkbenchController
    >[0]["operationAdministration"],
    builtInCatalog,
    changeEvents: withChangeEvents
      ? {
          dispose: disposeChangeEvents,
          start: startChangeEvents,
          subscribe(listener) {
            changeListeners.add(listener);
            return () => changeListeners.delete(listener);
          },
        }
      : undefined,
    createInitialWorkspaceContent: () => createContent(),
    createSearchVersion: async (value) =>
      `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` as const,
    journalRepositories,
    scheduler: testApplicationScheduler,
    timezoneOffsetMinutes: () => 0,
    todoRepositories,
    workspaceCatalog,
    workspaceCommandDependencies: {
      createBlockId: () => "00000000-0000-4000-8000-000000000001",
      createFolderId: () => "folder-created",
      createNoteId: () => "note-created",
      createSyntaxFileId: () =>
        "syntax-00000000-0000-4000-8000-000000000002",
      now: () => "2026-07-23T00:00:00.000Z",
    },
    workspaceRepositories,
  });

  return {
    controller,
    disposeChangeEvents,
    emitChange(event: DomainChangeNotification) {
      changeListeners.forEach((listener) => listener(event));
    },
    events,
    startChangeEvents,
    workspaceCatalog,
  };
}

describe("Workbench controller", () => {
  it("mounts peer sessions and keeps them independently ready", async () => {
    const { controller } = createHarness();

    controller.start();
    const snapshot = await waitForSnapshot(controller, (current) =>
      current.workspace.status === "ready" &&
      current.builtIns.journal.state.status === "ready" &&
      current.builtIns.todo.state.status === "ready"
    );

    expect(snapshot.catalog.activeDescriptor?.id).toBe("repository-a");
    expect(snapshot.workspace.status).toBe("ready");
    expect(snapshot.builtIns.journal.state.status).toBe("ready");
    expect(snapshot.builtIns.todo.state.status).toBe("ready");
    controller.dispose();
  });

  it("searches unopened repositories and retains submitted state across switching", async () => {
    const repositoryBContent = createContent("仓库B", "B");
    const baseRepositoryBSnapshot = createSnapshot({
      content: repositoryBContent,
    });
    let repositoryBContentReadable = true;
    const repositoryBSnapshot: WorkspaceRepositorySnapshot = {
      ...baseRepositoryBSnapshot,
      get content() {
        if (!repositoryBContentReadable) {
          throw new Error("unchanged repository content was analyzed again");
        }
        return repositoryBContent;
      },
    };
    const { controller, events } = createHarness({
      repositoryBLoad: async () => repositoryBSnapshot,
    });

    controller.start();
    await waitForSnapshot(
      controller,
      ({ workspace }) => workspace.status === "ready",
    );
    const search = controller.search;
    const activeWorkspace = controller.getSnapshot().workspace;

    expect(activeWorkspace.status).toBe("ready");
    if (activeWorkspace.status !== "ready") {
      throw new Error("Workspace did not become ready");
    }
    const activeSource = activeWorkspace.workspace.data.notes[0]!.source;

    controller.workspace.commands.updateNoteSource(
      "note-1",
      replaceEditableSource(activeSource, "尚未同步的本地检索内容"),
    );
    const workspaceBeforeSearch = controller.getSnapshot().workspace;
    const analysisRunsBeforeSearch = workspaceBeforeSearch.status === "ready"
      ? workspaceBeforeSearch.analysisIndex?.analysisStats.runCount
      : null;

    search.updateDraft({
      domains: ["workspace"],
      query: "尚未同步的本地检索内容",
    });
    await search.search();
    expect(controller.getSnapshot().search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: "repository-a",
          resourceId: "note-1",
        }),
      ]),
    );
    const workspaceAfterSearch = controller.getSnapshot().workspace;

    expect(workspaceAfterSearch.status === "ready"
      ? workspaceAfterSearch.analysisIndex?.analysisStats.runCount
      : null).toBe(analysisRunsBeforeSearch);

    search.updateDraft({
      domains: ["workspace"],
      query: "B",
    });
    await search.search();

    const searchState = controller.getSnapshot().search;

    expect(searchState).toMatchObject({
      errorMessage: null,
      faults: [],
      status: "ready",
      submitted: { query: "B" },
    });
    expect(searchState.results.length).toBeGreaterThan(0);
    expect(searchState.results.every((result) =>
      result.domain === "workspace" &&
      result.repositoryId === "repository-b" &&
      result.resourceId === "note-1"
    )).toBe(true);
    expect(events.filter((event) => event === "open:repository-b")).toHaveLength(
      2,
    );

    repositoryBContentReadable = false;
    await search.search();
    expect(controller.getSnapshot().search.faults).toEqual([]);
    expect(events.filter((event) => event === "open:repository-b")).toHaveLength(
      3,
    );

    repositoryBContentReadable = true;
    await controller.selectRepository("repository-b");
    await waitForSnapshot(
      controller,
      ({ workspace }) => workspace.status === "ready",
    );
    expect(controller.getSnapshot().search.submitted?.query).toBe("B");
    controller.dispose();
  });

  it("uses SSE checkpoints to reload only stale mounted domain sessions", async () => {
    const harness = createHarness({ withChangeEvents: true });

    harness.controller.start();
    const snapshot = await waitForSnapshot(harness.controller, (current) =>
      current.workspace.status === "ready" &&
      current.builtIns.journal.state.status === "ready" &&
      current.builtIns.todo.state.status === "ready"
    );
    if (snapshot.workspace.status !== "ready") throw new Error("not ready");
    const reloadWorkspace = vi.fn(async () => undefined);
    const reloadJournal = vi.fn(async () => undefined);
    const reloadTodo = vi.fn(async () => undefined);

    harness.controller.workspace.reload = reloadWorkspace;
    harness.controller.journal.reload = reloadJournal;
    harness.controller.todo.reload = reloadTodo;
    const notification: DomainChangeNotification = {
      changedDomains: {
        journal: true,
        todo: true,
        workspaceCatalog: false,
        workspaceRepositoryIds: ["repository-a"],
      },
      checkpoint: {
        journal: builtInRevision("c"),
        sequence: 1,
        streamId: "stream-a",
        todo: builtInRevision("c"),
        workspaces: {
          "repository-a": remoteRevision("b"),
          "repository-b": remoteRevision("c"),
        },
      },
      sequence: 1,
      streamId: "stream-a",
    };

    harness.emitChange(notification);
    await vi.waitFor(() => {
      expect(reloadWorkspace).toHaveBeenCalledOnce();
      expect(reloadJournal).toHaveBeenCalledOnce();
      expect(reloadTodo).toHaveBeenCalledOnce();
    });
    harness.emitChange(notification);
    await Promise.resolve();
    expect(reloadWorkspace).toHaveBeenCalledOnce();
    expect(harness.startChangeEvents).toHaveBeenCalledOnce();

    harness.emitChange({
      ...notification,
      changedDomains: {
        ...notification.changedDomains,
        workspaceCatalog: true,
      },
      checkpoint: { ...notification.checkpoint, sequence: 2 },
      sequence: 2,
    });
    await vi.waitFor(() => {
      expect(harness.workspaceCatalog.listRepositories).toHaveBeenCalledTimes(2);
    });
    harness.emitChange({
      ...notification,
      checkpoint: {
        ...notification.checkpoint,
        sequence: 0,
        streamId: "stream-b",
      },
      sequence: 0,
      streamId: "stream-b",
    });
    await vi.waitFor(() => {
      expect(reloadWorkspace).toHaveBeenCalledTimes(2);
      expect(reloadJournal).toHaveBeenCalledTimes(2);
      expect(reloadTodo).toHaveBeenCalledTimes(2);
    });

    harness.controller.dispose();
    expect(harness.disposeChangeEvents).toHaveBeenCalledOnce();
  });

  it("flushes before switching and waits for the target session before focus", async () => {
    const targetLoad = deferred<WorkspaceRepositorySnapshot>();
    const { controller, events } = createHarness({
      repositoryBLoad: () => targetLoad.promise,
    });

    controller.start();
    const initial = await waitForSnapshot(
      controller,
      ({ workspace }) => workspace.status === "ready",
    );
    if (initial.workspace.status !== "ready") throw new Error("not ready");
    const originalFlush = controller.workspace.flushPendingChanges;

    controller.workspace.flushPendingChanges = async () => {
      events.push("flush");
      await originalFlush();
    };
    const requestId = controller.requestWorkspaceNoteDestination({
      blockId: null,
      domain: "workspace",
      repositoryId: "repository-b",
      resourceId: "note-1",
    });

    await vi.waitFor(() => {
      expect(controller.getSnapshot().catalog.activeDescriptor?.id).toBe(
        "repository-b",
      );
    });
    expect(controller.getSnapshot().navigation.status).toBe("pending");
    expect(events.indexOf("flush")).toBeLessThan(
      events.indexOf("select:repository-b"),
    );

    await Promise.resolve();
    expect(controller.getSnapshot().navigation.status).toBe("pending");

    targetLoad.resolve(createSnapshot({ content: createContent("仓库B", "B") }));
    await waitForSnapshot(
      controller,
      ({ navigation }) => navigation.status === "ready",
    );
    expect(controller.getSnapshot().navigation).toMatchObject({ requestId });

    controller.consumeWorkspaceNoteDestination(requestId);
    expect(controller.getSnapshot().navigation.status).toBe("idle");
    controller.dispose();

    const failedHarness = createHarness();

    failedHarness.controller.start();
    const failedInitial = await waitForSnapshot(
      failedHarness.controller,
      ({ workspace }) => workspace.status === "ready",
    );

    if (failedInitial.workspace.status !== "ready") {
      throw new Error("failed-switch workspace is not ready");
    }
    failedHarness.controller.workspace.flushPendingChanges = vi.fn(
      async () => {
        throw new Error("local stage failed");
      },
    );
    failedHarness.controller.requestWorkspaceNoteDestination({
      blockId: null,
      domain: "workspace",
      repositoryId: "repository-b",
      resourceId: "note-1",
    });

    await waitForSnapshot(
      failedHarness.controller,
      ({ navigation }) => navigation.status === "failed",
    );
    expect(
      failedHarness.controller.getSnapshot().catalog.activeDescriptor?.id,
    ).toBe("repository-a");
    expect(failedHarness.events).not.toContain("select:repository-b");
    expect(failedHarness.controller.getSnapshot().navigation).toMatchObject({
      errorMessage: "local stage failed",
      status: "failed",
    });
    failedHarness.controller.dispose();
  });

  it("resumes a prepared active session when deletion fails", async () => {
    const { controller, workspaceCatalog } = createHarness();

    controller.start();
    const snapshot = await waitForSnapshot(
      controller,
      ({ workspace }) => workspace.status === "ready",
    );
    if (snapshot.workspace.status !== "ready") throw new Error("not ready");
    const resume = vi.fn();

    controller.workspace.prepareForRepositoryRemoval = vi.fn(
      async () => ({ resume }),
    );
    vi.mocked(workspaceCatalog.deleteRepository).mockRejectedValueOnce(
      new Error("delete failed"),
    );

    await expect(controller.deleteRepository({
      id: "repository-a",
    })).rejects.toThrow("delete failed");
    expect(resume).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
