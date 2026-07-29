// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchController,
  type WorkbenchController,
  type WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type {
  BuiltInCatalog,
  BuiltInDescriptor,
  BuiltInLocalDraftRevision,
  ContentRevision,
  JournalRepository,
  TodoRepository,
} from "../../../application/repository/builtInRepository";
import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../application/repository/workspaceRepository";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../../../application/repository/workspaceRepositoryCatalog";
import { createEmptyJournalContent } from "../../journal/journalTestFixture";
import { createEmptyTodoContent } from "../../todo/todoTestFixture";
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
import {
  createVersionedContentRevision,
} from "../../../infrastructure/persistence/versionedContentRevision";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

const workspaceDescriptors: WorkspaceRepositoryDescriptor[] = [
  {
    adapter: "browser",
    id: "repository-a",
    label: "仓库A",
    labelIssue: null,
    location: { databaseName: "a", type: "browser" },
  },
  {
    adapter: "browser",
    id: "repository-b",
    label: "仓库B",
    labelIssue: null,
    location: { databaseName: "b", type: "browser" },
  },
];

const builtInDescriptors: BuiltInDescriptor[] = [
  {
    id: "journal",
    label: "日记",
    location: { databaseName: "journal", type: "browser" },
    protected: true,
  },
  {
    id: "todo",
    label: "代办",
    location: { databaseName: "todo", type: "browser" },
    protected: true,
  },
];

const builtInRevision = (character: string) =>
  `sha256:${character.repeat(64)}` as ContentRevision;
const builtInDraft = (suffix: string) =>
  `draft:00000000-0000-4000-8000-${suffix.padStart(12, "0")}` as
    BuiltInLocalDraftRevision;

function createBuiltInRepository<Content>(
  label: string,
  content: Content,
  location: BuiltInDescriptor["location"],
) {
  return {
    discardPendingSnapshotAndReload: async () => ({
      conflictRevision: null,
      content,
      localRevision: builtInDraft("9"),
      pendingChanges: false,
      remoteRevision: builtInRevision("b"),
    }),
    label,
    loadSnapshot: async () => ({
      conflictRevision: null,
      content,
      localRevision: builtInDraft("0"),
      pendingChanges: false,
      remoteRevision: builtInRevision("a"),
    }),
    location,
    stageSnapshot: async () => ({ localRevision: builtInDraft("1") }),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => ({
      localRevision: builtInDraft("1"),
      pendingChanges: false,
      remoteRevision: builtInRevision("b"),
      status: "synced" as const,
    }),
  };
}

function createWorkspaceRepository(
  descriptor: WorkspaceRepositoryDescriptor,
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshot>,
): WorkspaceRepository {
  return {
    discardPendingSnapshotAndReload: loadSnapshot,
    label: descriptor.label,
    loadSnapshot,
    location: descriptor.location,
    stageSnapshot: async () => ({ localRevision: draftRevision("next") }),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => ({
      localRevision: draftRevision("next"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }),
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
    createRepository: vi.fn(),
    deleteRepository: vi.fn(async () => ({ status: "deleted" as const })),
    label: "Repositories",
    listRepositories: vi.fn(async () => ({
      creatableAdapters: ["browser" as const],
      issues: [],
      repositories: workspaceDescriptors,
    })),
    openRepository(descriptor) {
      events.push(`open:${descriptor.id}`);
      return repositories.get(descriptor.id)!;
    },
    renameRepository: vi.fn(),
  };
  const journalRepository = createBuiltInRepository(
    "日记",
    createEmptyJournalContent(),
    builtInDescriptors[0].location,
  ) as JournalRepository;
  const todoRepository = createBuiltInRepository(
    "代办",
    createEmptyTodoContent(),
    builtInDescriptors[1].location,
  ) as TodoRepository;
  const builtInCatalog: BuiltInCatalog = {
    label: "Built-ins",
    listBuiltIns: vi.fn(async () => ({
      issues: [],
      repositories: builtInDescriptors,
    })),
    openJournal: () => journalRepository,
    openTodo: () => todoRepository,
    retry: vi.fn(async () => ({ status: "ready" as const })),
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
    createSearchVersion: (value) =>
      createVersionedContentRevision(JSON.stringify(value)),
    scheduler: testApplicationScheduler,
    workspaceCatalog,
    workspaceCommandDependencies: {
      createBlockId: () => "00000000-0000-4000-8000-000000000001",
      createFolderId: () => "folder-created",
      createNoteId: () => "note-created",
      createSyntaxFileId: () =>
        "syntax-00000000-0000-4000-8000-000000000002",
      now: () => "2026-07-23T00:00:00.000Z",
    },
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
    const search = controller.getSnapshot().search.controller;
    const activeWorkspace = controller.getSnapshot().workspace;

    expect(activeWorkspace.status).toBe("ready");
    if (activeWorkspace.status !== "ready") {
      throw new Error("Workspace did not become ready");
    }
    const activeSource = activeWorkspace.workspace.data.notes[0]!.source;

    activeWorkspace.controller.commands.updateNoteSource(
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
      repositoryIds: ["repository-a"],
    });
    await search.search();
    expect(controller.getSnapshot().search.state.results).toEqual(
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
      repositoryIds: null,
    });
    await search.search();

    const searchState = controller.getSnapshot().search.state;

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
      1,
    );

    repositoryBContentReadable = false;
    await search.search();
    expect(controller.getSnapshot().search.state.faults).toEqual([]);
    expect(events.filter((event) => event === "open:repository-b")).toHaveLength(
      2,
    );

    repositoryBContentReadable = true;
    await controller.selectRepository("repository-b");
    await waitForSnapshot(
      controller,
      ({ workspace }) => workspace.status === "ready",
    );
    expect(controller.getSnapshot().search.state.submitted?.query).toBe("B");
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

    snapshot.workspace.controller.reload = reloadWorkspace;
    snapshot.builtIns.journal.controller.reload = reloadJournal;
    snapshot.builtIns.todo.controller.reload = reloadTodo;
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
    const originalFlush = initial.workspace.controller.flushPendingChanges;

    initial.workspace.controller.flushPendingChanges = async () => {
      events.push("flush");
      await originalFlush();
    };
    const requestId = controller.requestWorkspaceNoteDestination({
      description: "仓库B",
      id: "workspace-note:repository-b:note-1",
      kind: "workspace-note",
      label: "仓库B:B",
      lineNumber: 1,
      noteId: "note-1",
      repositoryId: "repository-b",
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
    failedInitial.workspace.controller.flushPendingChanges = vi.fn(
      async () => {
        throw new Error("local stage failed");
      },
    );
    failedHarness.controller.requestWorkspaceNoteDestination({
      description: "仓库B",
      id: "workspace-note:repository-b:note-1",
      kind: "workspace-note",
      label: "仓库B:B",
      lineNumber: 1,
      noteId: "note-1",
      repositoryId: "repository-b",
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

    snapshot.workspace.controller.prepareForRepositoryRemoval = vi.fn(
      async () => ({ resume }),
    );
    vi.mocked(workspaceCatalog.deleteRepository).mockRejectedValueOnce(
      new Error("delete failed"),
    );

    await expect(controller.deleteRepository({
      id: "repository-a",
      mode: "delete-managed-data",
    })).rejects.toThrow("delete failed");
    expect(resume).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
