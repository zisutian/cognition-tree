import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
  WorkspaceRepositorySyncResult,
} from "../../../../application/repository/workspaceRepository";
import {
  createWorkspaceSessionController,
  WorkspaceSessionUnavailableError,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../../../../application/workspace/session/workspaceSessionController";
import { workspaceSessionSaveDelayMs } from "../../../../application/workspace/session/workspaceSessionSaveQueue";
import { createCtnEditableSource } from "../../../../core/ctn/metadata/editableSource";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../../../core/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../../core/ctn/syntax/defaultSyntaxProfile";
import { formatSyntaxProfileToml } from "../../../../core/ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../../core/ctn/syntax/types";
import { createCanonicalNoteSource } from "../../../../core/workspace/model/workspaceData";
import { WorkspaceBlockMetadataError } from "../../../../core/workspace/context/workspaceBlockMetadata";
import {
  createSnapshot,
  createContent,
  draftRevision,
  initialTimestamp,
  remoteRevision,
  replaceEditableSource,
} from "./workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../../support/testApplicationScheduler";

const questionMultilineSyntaxProfile: CtnSyntaxProfile = {
  ...defaultCtnSyntaxProfile,
  markerRules: defaultCtnSyntaxProfile.markerRules.map((rule) =>
    rule.marker === "?" ? { ...rule, role: "multiline" } : rule
  ),
};

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

type RepositoryHarness = {
  emitReconnect: () => void;
  getLocalContent: () => WorkspaceRepositoryContent;
  repository: WorkspaceRepository;
  setDiscard: (
    discard: WorkspaceRepository["discardPendingSnapshotAndReload"],
  ) => void;
  setLoad: (load: WorkspaceRepository["loadSnapshot"]) => void;
  stagedContents: WorkspaceRepositoryContent[];
  synchronize: ReturnType<typeof vi.fn<WorkspaceRepository["synchronizePendingSnapshot"]>>;
};

function createRepositoryHarness({
  initialSnapshot = createSnapshot(),
  synchronizeResults = [],
}: {
  initialSnapshot?: WorkspaceRepositorySnapshot;
  synchronizeResults?: WorkspaceRepositorySyncResult[];
} = {}): RepositoryHarness {
  let snapshot = initialSnapshot;
  let localRevisionIndex = 0;
  let reconnectListener: () => void = () => undefined;
  let load: WorkspaceRepository["loadSnapshot"] = async () => snapshot;
  let discard: WorkspaceRepository["discardPendingSnapshotAndReload"] =
    async () => {
      snapshot = {
        ...snapshot,
        pendingChanges: false,
      };
      return snapshot;
    };
  const stagedContents: WorkspaceRepositoryContent[] = [];
  const results = [...synchronizeResults];
  const synchronize = vi.fn<WorkspaceRepository["synchronizePendingSnapshot"]>(
    async () => {
      const result = results.shift() ?? {
        localRevision: snapshot.localRevision,
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
        status: "synced" as const,
      };

      snapshot = {
        ...snapshot,
        conflictRevision:
          result.status === "conflict" ? result.remoteRevision : null,
        localRevision: result.localRevision,
        pendingChanges: result.status === "synced"
          ? result.pendingChanges
          : true,
        remoteRevision: result.remoteRevision,
      };
      return result;
    },
  );
  const repository: WorkspaceRepository = {
    discardPendingSnapshotAndReload: () => discard(),
    label: "test repository",
    loadSnapshot: () => load(),
    location: { databaseName: "test", type: "browser" },
    async stageSnapshot({ content, expectedLocalRevision }) {
      if (expectedLocalRevision !== snapshot.localRevision) {
        throw new Error("local revision mismatch");
      }

      localRevisionIndex += 1;
      snapshot = {
        ...snapshot,
        content,
        localRevision: draftRevision(`stage-${localRevisionIndex}`),
        pendingChanges: true,
      };
      stagedContents.push(content);
      return { localRevision: snapshot.localRevision };
    },
    subscribeReconnect(listener) {
      reconnectListener = listener;
      return () => {
        reconnectListener = () => undefined;
      };
    },
    synchronizePendingSnapshot: synchronize,
  };

  return {
    emitReconnect: () => reconnectListener(),
    getLocalContent: () => snapshot.content,
    repository,
    setDiscard(nextDiscard) {
      discard = nextDiscard;
    },
    setLoad(nextLoad) {
      load = nextLoad;
    },
    stagedContents,
    synchronize,
  };
}

function createController(
  repository: WorkspaceRepository,
  commandDependencyOverrides: Partial<
    Parameters<typeof createWorkspaceSessionController>[0]["commandDependencies"]
  > = {},
) {
  let blockId = 10;

  return createWorkspaceSessionController({
    commandDependencies: {
      createBlockId: () =>
        `00000000-0000-4000-8000-${String(++blockId).padStart(12, "0")}`,
      createFolderId: () => "folder-created",
      createNoteId: () => "note-created",
      createSyntaxFileId: () =>
        "syntax-00000000-0000-4000-8000-000000000002",
      now: () => "2026-07-16T00:00:00.000Z",
      ...commandDependencyOverrides,
    },
    repository,
    scheduler: testApplicationScheduler,
  });
}

function waitForState(
  controller: WorkspaceSessionController,
  predicate: (state: WorkspaceSessionControllerState) => boolean,
) {
  const currentState = controller.getState();

  if (predicate(currentState)) {
    return Promise.resolve(currentState);
  }

  return new Promise<WorkspaceSessionControllerState>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getState();

      if (predicate(state)) {
        unsubscribe();
        resolve(state);
      }
    });
  });
}

function updateNote(
  controller: WorkspaceSessionController,
  source: string,
) {
  const state = controller.getState();

  if (state.status !== "ready") {
    throw new Error("controller is not ready");
  }

  const note = state.workspace.noteEntryById.get("note-1")?.note;

  if (!note) {
    throw new Error("note fixture is missing");
  }

  controller.commands.updateNoteSource(
    note.id,
    replaceEditableSource(note.source, source),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace session controller", () => {
  it("returns the canonical configured editor source and preserves it after an invalid title", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready") {
      throw new Error("configured workspace did not become ready");
    }
    const note = ready.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("configured note fixture is missing");
    }
    const result = controller.commands.updateNoteSource(
      note.id,
      replaceEditableSource(note.source, "  Cafe\u0301   标题  \n正文"),
    );

    expect(result).toEqual({
      authoritativeSource: "Café 标题\n正文",
      titleNormalized: true,
    });
    const normalizedState = controller.getState();

    if (normalizedState.status !== "ready") {
      throw new Error("configured update was not published");
    }
    const normalizedNote = normalizedState.workspace.noteEntryById.get(
      note.id,
    )?.note;

    if (!normalizedNote) {
      throw new Error("normalized note is missing");
    }
    expect(() => controller.commands.updateNoteSource(
      note.id,
      replaceEditableSource(normalizedNote.source, "bad:title\n正文"),
    )).toThrow("Workspace note title contains unsupported characters");
    expect(controller.getState()).toBe(normalizedState);
    controller.dispose();
  });

  it("returns the canonical raw source and preserves it after an invalid title", async () => {
    const configuredContent = createContent();
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({
        content: {
          ...configuredContent,
          syntax: { activeFileId: null, files: [] },
        },
      }),
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready") {
      throw new Error("raw workspace did not become ready");
    }
    const note = ready.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("raw note fixture is missing");
    }
    const normalizedSource = note.source.replace(
      "\n标题\n",
      "\n  Cafe\u0301   标题  \n",
    );
    const result = controller.commands.updateNoteSource(note.id, {
      edits: [{
        from: 0,
        insertedText: normalizedSource,
        to: note.source.length,
      }],
      source: normalizedSource,
    });

    expect(result.authoritativeSource).toContain("\nCafé 标题\n");
    expect(result.titleNormalized).toBe(true);
    const normalizedState = controller.getState();

    if (normalizedState.status !== "ready") {
      throw new Error("raw update was not published");
    }
    const normalizedNote = normalizedState.workspace.noteEntryById.get(
      note.id,
    )?.note;

    if (!normalizedNote) {
      throw new Error("normalized raw note is missing");
    }
    const invalidSource = normalizedNote.source.replace(
      "\nCafé 标题\n",
      "\nbad:title\n",
    );

    expect(() => controller.commands.updateNoteSource(note.id, {
      edits: [{
        from: 0,
        insertedText: invalidSource,
        to: normalizedNote.source.length,
      }],
      source: invalidSource,
    })).toThrow("Workspace note title contains unsupported characters");
    expect(controller.getState()).toBe(normalizedState);
    controller.dispose();
  });

  it("does not expose a mutable fallback workspace while loading", async () => {
    const load = createDeferred<WorkspaceRepositorySnapshot>();
    const harness = createRepositoryHarness();

    harness.setLoad(() => load.promise);
    const controller = createController(harness.repository);
    controller.start();

    expect(controller.getState()).toEqual({
      status: "loading",
      storageLabel: "test repository",
    });
    expect(() =>
      controller.commands.updateNoteSource("note-1", {
        edits: [],
        source: "",
      })
    ).toThrow(WorkspaceSessionUnavailableError);
    expect(harness.stagedContents).toEqual([]);

    load.resolve(createSnapshot());
    await waitForState(controller, (state) => state.status === "ready");
    controller.dispose();
  });

  it("opens a refreshed pending Local draft directly in ready conflict state", async () => {
    const conflictRevision = remoteRevision("c");
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({
        conflictRevision,
        content: createContent("Local draft"),
        pendingChanges: true,
        remoteRevision: conflictRevision,
      }),
    });
    const controller = createController(harness.repository);

    controller.start();
    const state = await waitForState(
      controller,
      (candidate) => candidate.status === "ready",
    );

    expect(state).toMatchObject({
      location: { databaseName: "test", type: "browser" },
      persistence: { remoteRevision: conflictRevision, status: "conflict" },
      status: "ready",
    });
    expect(harness.synchronize).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("installs a clean remote-first reload with its newly allocated local revision", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    harness.setLoad(async () => createSnapshot({
      content: createContent("Externally refreshed workspace"),
      localRevision: draftRevision("remote-refresh"),
      remoteRevision: remoteRevision("c"),
    }));

    await controller.reload();
    const state = controller.getState();

    expect(state).toMatchObject({
      status: "ready",
      workspace: {
        data: { name: "Externally refreshed workspace" },
      },
    });
    controller.dispose();
  });

  it("creates a second note in a raw workspace while treating body directives as opaque text", async () => {
    const configuredContent = createSnapshot().content;
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({
        content: {
          ...configuredContent,
          syntax: { activeFileId: null, files: [] },
        },
      }),
    });
    let generatedBlockId = 0;
    const controller = createController(harness.repository, {
      createBlockId: () =>
        `00000000-0000-4000-8000-${String(++generatedBlockId).padStart(12, "0")}`,
      createNoteId: () => "note-raw-created",
    });

    controller.start();
    const ready = await waitForState(
      controller,
      (state) => state.status === "ready",
    );

    expect(ready).toMatchObject({ status: "ready", workspaceSyntax: null });
    expect(controller.commands.createNote(null)).toBe("note-raw-created");
    await controller.flushPendingChanges();

    const localWorkspace = harness.getLocalContent().workspace;
    const createdNote = localWorkspace.notes.find(
      ({ id }) => id === "note-raw-created",
    );

    expect(localWorkspace.notes).toHaveLength(2);
    expect(createdNote).toBeDefined();
    expect(
      readCtnCanonicalTitleHeader(createdNote?.source ?? "").metadata.id,
    ).toBe("00000000-0000-4000-8000-000000000002");
    expect(generatedBlockId).toBe(2);
    controller.dispose();
  });

  it("canonicalizes opaque raw bodies before publishing the first valid syntax", async () => {
    const blockId = (value: number) =>
      `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    const rawDirective = `@ctn-block id=${blockId(999)} created=${initialTimestamp} updated=${initialTimestamp}`;
    const createRawSource = (id: number, title: string, body: string) =>
      `${createCanonicalNoteSource({
        blockId: blockId(id),
        timestamp: initialTimestamp,
        title,
      })}\n${body}`;
    const configuredContent = createSnapshot().content;
    const rawContent: WorkspaceRepositoryContent = {
      ...configuredContent,
      syntax: { activeFileId: null, files: [] },
      workspace: {
        ...configuredContent.workspace,
        notes: [
          {
            id: "note-1",
            source: createRawSource(1, "Raw A", `Root\n${rawDirective}`),
          },
          {
            id: "note-2",
            source: createRawSource(2, "Raw B", "\t? Question"),
          },
        ],
        tree: [
          { kind: "note", noteId: "note-1" },
          { kind: "note", noteId: "note-2" },
        ],
      },
    };
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({ content: rawContent }),
    });
    let generatedId = 0;
    const controller = createController(harness.repository, {
      createBlockId: () => blockId(++generatedId),
    });

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const createdFileId = await controller.createSyntaxFile(null);
    const rawWithInactiveFile = controller.getState();

    expect(rawWithInactiveFile).toMatchObject({
      status: "ready",
      syntaxCatalog: { activeFileId: null },
      workspaceSyntax: null,
    });
    const syntaxSave = controller.activateSyntaxFile(createdFileId);
    const configuredState = controller.getState();

    if (configuredState.status !== "ready") {
      throw new Error("syntax configuration was not published synchronously");
    }

    expect(configuredState.workspaceSyntax).not.toBeNull();
    expect(configuredState.context?.syntaxProfile).toEqual(
      defaultCtnSyntaxProfile,
    );
    const canonicalNotes = [...configuredState.workspace.noteEntryById.values()]
      .map(({ note }) => parseCtnCanonicalDocument(
        note.source,
        defaultCtnSyntaxProfile,
      ));
    const allIds = canonicalNotes.flatMap((document) =>
      document.blocks.map(({ id }) => id)
    );

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(canonicalNotes[0]?.blocks[0]?.id).toBe(blockId(1));
    expect(canonicalNotes[1]?.blocks[0]?.id).toBe(blockId(2));
    expect(canonicalNotes[0]?.blocks[2]?.rawText).toBe(rawDirective);
    expect(
      canonicalNotes[0]?.blocks[2]?.diagnostics.map(({ code }) => code),
    ).toContain("reserved-directive");

    const note = configuredState.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("raw note disappeared during syntax initialization");
    }

    const editable = createCtnEditableSource(
      note.source,
      defaultCtnSyntaxProfile,
    ).source;
    controller.commands.updateNoteSource(note.id, {
      edits: [{
        from: editable.length,
        insertedText: "\nNew block",
        to: editable.length,
      }],
      source: `${editable}\nNew block`,
    });

    await syntaxSave;
    await controller.flushPendingChanges();
    const stagedNote = harness.getLocalContent().workspace.notes.find(
      ({ id }) => id === "note-1",
    );

    expect(createCtnEditableSource(
      stagedNote?.source ?? "",
      defaultCtnSyntaxProfile,
    ).source).toBe(`Raw A\nRoot\n${rawDirective}\nNew block`);
    expect(parseCtnCanonicalDocument(
      stagedNote?.source ?? "",
      defaultCtnSyntaxProfile,
    ).blocks).toHaveLength(4);
    controller.dispose();
  });

  it("stages command results locally and exposes the unified persistence state", async () => {
    vi.useFakeTimers();
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n第一次");
    await controller.flushPendingChanges();

    expect(harness.stagedContents).toHaveLength(1);
    expect(controller.getState()).toMatchObject({
      persistence: { status: "pending-sync" },
      status: "ready",
    });

    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(harness.synchronize).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      persistence: { status: "saved" },
      status: "ready",
    });
    controller.dispose();
  });

  it("keeps staging the latest local edit after a remote conflict", async () => {
    vi.useFakeTimers();
    const conflictRevision = remoteRevision("c");
    const harness = createRepositoryHarness({
      synchronizeResults: [{
        localRevision: draftRevision("stage-1"),
        remoteRevision: conflictRevision,
        status: "conflict",
      }],
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n触发冲突");
    await controller.flushPendingChanges();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(controller.getState()).toMatchObject({
      persistence: { remoteRevision: conflictRevision, status: "conflict" },
      status: "ready",
    });

    updateNote(controller, "标题\n冲突后的旧内容");
    updateNote(controller, "标题\n冲突后的最终内容");
    await controller.flushPendingChanges();

    const localSource = harness.getLocalContent().workspace.notes[0]?.source ?? "";
    expect(
      createCtnEditableSource(localSource, defaultCtnSyntaxProfile).source,
    ).toBe("标题\n冲突后的最终内容");
    expect(harness.synchronize).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      persistence: { remoteRevision: conflictRevision, status: "conflict" },
      status: "ready",
    });
    controller.dispose();
  });

  it("synchronizes automatically when reconnect is observed", async () => {
    vi.useFakeTimers();
    const harness = createRepositoryHarness({
      synchronizeResults: [
        {
          localRevision: draftRevision("stage-1"),
          pendingChanges: true,
          remoteRevision: remoteRevision("a"),
          status: "offline",
        },
        {
          localRevision: draftRevision("stage-1"),
          pendingChanges: false,
          remoteRevision: remoteRevision("b"),
          status: "synced",
        },
      ],
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n离线编辑");
    await controller.flushPendingChanges();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(controller.getState()).toMatchObject({
      persistence: { pendingChanges: true, status: "offline" },
      status: "ready",
    });

    harness.emitReconnect();
    await waitForState(
      controller,
      (state) =>
        state.status === "ready" && state.persistence.status === "saved",
    );

    expect(harness.synchronize).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("restores the ready conflict state when discard fails and keeps ready state when reload fails", async () => {
    vi.useFakeTimers();
    const conflictRevision = remoteRevision("d");
    const harness = createRepositoryHarness({
      synchronizeResults: [{
        localRevision: draftRevision("stage-1"),
        remoteRevision: conflictRevision,
        status: "conflict",
      }],
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n必须保留的本地内容");
    await controller.flushPendingChanges();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    harness.setDiscard(async () => {
      throw new Error("remote reload failed");
    });

    await expect(controller.discardPendingChangesAndReload()).rejects.toThrow(
      "remote reload failed",
    );
    expect(controller.getState()).toMatchObject({
      persistence: { remoteRevision: conflictRevision, status: "conflict" },
      status: "ready",
    });
    expect(
      createCtnEditableSource(
        harness.getLocalContent().workspace.notes[0]!.source,
        defaultCtnSyntaxProfile,
      ).source,
    ).toBe("标题\n必须保留的本地内容");

    harness.setLoad(async () => {
      throw new Error("temporary load failure");
    });
    await expect(controller.reload()).rejects.toThrow("temporary load failure");
    expect(controller.getState()).toMatchObject({
      persistence: { remoteRevision: conflictRevision, status: "conflict" },
      status: "ready",
    });
    controller.dispose();
  });

  it("keeps an immediately staged local edit writable when discard reload fails", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\ndiscard 前的即时编辑");
    harness.setDiscard(async () => {
      throw new Error("remote discard read failed");
    });

    await expect(controller.discardPendingChangesAndReload()).rejects.toThrow(
      "remote discard read failed",
    );
    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "discard 前的即时编辑",
    );

    updateNote(controller, "标题\ndiscard 失败后的后续编辑");
    await controller.flushPendingChanges();

    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "discard 失败后的后续编辑",
    );
    expect(controller.getState()).toMatchObject({
      persistence: { status: "pending-sync" },
      status: "ready",
    });
    controller.dispose();
  });

  it("rejects a damaged raw title returned by discard and keeps the local pending session ready", async () => {
    const configuredContent = createContent();
    const rawContent: WorkspaceRepositoryContent = {
      ...configuredContent,
      syntax: { activeFileId: null, files: [] },
    };
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({ content: rawContent }),
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready") {
      throw new Error("raw workspace did not become ready");
    }

    const note = ready.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("raw workspace note is missing");
    }

    const localSource = `${note.source}\n本地待同步内容`;
    controller.commands.updateNoteSource(note.id, {
      edits: [{
        from: note.source.length,
        insertedText: "\n本地待同步内容",
        to: note.source.length,
      }],
      source: localSource,
    });
    const editedState = controller.getState();
    const expectedLocalSource = editedState.status === "ready"
      ? editedState.workspace.noteEntryById.get("note-1")?.note.source
      : null;

    expect(expectedLocalSource).toContain("本地待同步内容");
    harness.setDiscard(async () => createSnapshot({
      content: {
        ...rawContent,
        workspace: {
          ...rawContent.workspace,
          notes: [{ id: "note-1", source: "损坏的远端标题" }],
        },
      },
      localRevision: draftRevision("discarded-remote"),
      pendingChanges: false,
    }));

    await expect(controller.discardPendingChangesAndReload()).rejects.toThrow(
      WorkspaceBlockMetadataError,
    );
    expect(controller.getState()).toMatchObject({
      persistence: { status: "pending-sync" },
      status: "ready",
      workspaceSyntax: null,
    });
    const retainedState = controller.getState();

    expect(
      retainedState.status === "ready"
        ? retainedState.workspace.noteEntryById.get("note-1")?.note.source
        : null,
    ).toBe(expectedLocalSource);
    expect(harness.getLocalContent().workspace.notes[0]?.source).toBe(
      expectedLocalSource,
    );
    controller.dispose();
  });

  it("keeps the failed local desired snapshot retryable when discard preparation fails", async () => {
    const harness = createRepositoryHarness();
    const originalStage = harness.repository.stageSnapshot;
    let storageAvailable = false;

    harness.repository.stageSnapshot = async (input) => {
      if (!storageAvailable) {
        throw new Error("IndexedDB stage failed");
      }
      return originalStage(input);
    };
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\ndiscard 前尚未落盘的内容");
    await expect(controller.discardPendingChangesAndReload()).rejects.toThrow(
      "IndexedDB stage failed",
    );

    storageAvailable = true;
    await controller.flushPendingChanges();
    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "discard 前尚未落盘的内容",
    );
    expect(controller.getState()).toMatchObject({
      persistence: { status: "pending-sync" },
      status: "ready",
    });
    controller.dispose();
  });

  it("flushes an active local stage before reload installs its snapshot", async () => {
    const harness = createRepositoryHarness();
    const originalStage = harness.repository.stageSnapshot;
    const stageStarted = createDeferred<void>();
    const releaseStage = createDeferred<void>();

    harness.repository.stageSnapshot = async (input) => {
      stageStarted.resolve();
      await releaseStage.promise;
      return originalStage(input);
    };
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\nreload 前的即时编辑");
    await stageStarted.promise;

    const reload = controller.reload();

    releaseStage.resolve();
    await reload;
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        noteEntryById: expect.any(Map),
      },
    });
    const reloaded = controller.getState();

    expect(
      reloaded.status === "ready"
        ? reloaded.workspace.noteEntryById.get("note-1")?.note.source
        : "",
    ).toContain("reload 前的即时编辑");

    updateNote(controller, "标题\nreload 后仍可继续编辑");
    await controller.flushPendingChanges();
    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "reload 后仍可继续编辑",
    );
    controller.dispose();
  });

  it("reloads again when an edit is staged while its first local read is in flight", async () => {
    const harness = createRepositoryHarness();
    const firstLoadStarted = createDeferred<void>();
    const releaseFirstLoad = createDeferred<void>();
    const staleSnapshot = createSnapshot();
    let loadCount = 0;

    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    harness.setLoad(async () => {
      loadCount += 1;
      if (loadCount === 1) {
        firstLoadStarted.resolve();
        await releaseFirstLoad.promise;
        return staleSnapshot;
      }
      return {
        ...staleSnapshot,
        content: harness.getLocalContent(),
        localRevision: draftRevision("stage-1"),
        pendingChanges: true,
      };
    });
    const reload = controller.reload();

    await firstLoadStarted.promise;
    updateNote(controller, "标题\n异步 reload 期间的编辑");
    await controller.flushPendingChanges();
    releaseFirstLoad.resolve();
    await reload;

    const reloaded = controller.getState();
    expect(loadCount).toBe(2);
    expect(
      reloaded.status === "ready"
        ? reloaded.workspace.noteEntryById.get("note-1")?.note.source
        : "",
    ).toContain("异步 reload 期间的编辑");

    updateNote(controller, "标题\nreload 之后的下一次编辑");
    await controller.flushPendingChanges();
    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "reload 之后的下一次编辑",
    );
    controller.dispose();
  });

  it("publishes a valid syntax profile before awaiting persistence and rejects invalid syntax without exposure", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready" || !ready.workspaceSyntax) {
      throw new Error("syntax fixture did not load");
    }

    const changedSource = ready.workspaceSyntax.source.replace(
      'label = "定义"',
      'label = "即时定义"',
    );
    const activeFileId = ready.syntaxCatalog.activeFileId!;
    const localSave = controller.updateSyntaxFileSource(
      activeFileId,
      changedSource,
    );
    const updated = controller.getState();

    expect(updated.status).toBe("ready");
    expect(
      updated.status === "ready"
        ? updated.context?.syntaxProfile.markerRules.find(
          ({ marker }) => marker === ":",
        )?.label
        : null,
    ).toBe("即时定义");
    await localSave;

    expect(() => controller.updateSyntaxFileSource(activeFileId, "name ="))
      .toThrow("Invalid workspace syntax source");
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspaceSyntax: { source: changedSource },
    });
    controller.dispose();
  });

  it("creates without activating, explicitly activates, and deletes syntax files atomically", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    const initial = await waitForState(
      controller,
      (state) => state.status === "ready",
    );

    if (initial.status !== "ready") {
      throw new Error("syntax fixture did not load");
    }
    const originalFileId = initial.syntaxCatalog.activeFileId;

    const copyFileId = await controller.createSyntaxFile(originalFileId);
    const created = controller.getState();

    if (created.status !== "ready" || !originalFileId) {
      throw new Error("syntax copy was not published");
    }
    expect(created.syntaxCatalog.files).toHaveLength(2);
    expect(created.syntaxCatalog.activeFileId).toBe(originalFileId);
    expect(created.workspaceSyntax?.profile.name).toBe("默认 CTN 语法");
    expect(copyFileId).not.toBe(originalFileId);
    expect(created.syntaxCatalog.files.find(({ id }) => id === copyFileId)?.source)
      .toContain('name = "默认 CTN 语法 副本"');

    const stagedBeforeDuplicate = harness.stagedContents.length;
    const originalSource = created.syntaxCatalog.files.find(
      ({ id }) => id === originalFileId,
    )!.source;

    expect(() => controller.updateSyntaxFileSource(copyFileId, originalSource))
      .toThrow(/duplicate workspace syntax profile name/i);
    expect(harness.stagedContents).toHaveLength(stagedBeforeDuplicate);

    await controller.activateSyntaxFile(copyFileId);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      syntaxCatalog: { activeFileId: copyFileId },
    });

    await controller.deleteSyntaxFile(originalFileId);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      syntaxCatalog: { activeFileId: copyFileId },
    });

    await controller.deleteSyntaxFile(copyFileId!);
    const raw = controller.getState();

    expect(raw).toMatchObject({
      status: "ready",
      syntaxCatalog: { activeFileId: null, files: [] },
      workspaceSyntax: null,
    });
    expect(harness.getLocalContent().syntax).toEqual({
      activeFileId: null,
      files: [],
    });
    controller.dispose();
  });

  it("does not let an older syntax stage replace newer in-memory content", async () => {
    const harness = createRepositoryHarness();
    const originalStage = harness.repository.stageSnapshot;
    const firstStageStarted = createDeferred<void>();
    const releaseFirstStage = createDeferred<void>();
    const secondStageStarted = createDeferred<void>();
    const releaseSecondStage = createDeferred<void>();
    let stageCount = 0;

    harness.repository.stageSnapshot = async (input) => {
      stageCount += 1;
      if (stageCount === 1) {
        firstStageStarted.resolve();
        await releaseFirstStage.promise;
      } else if (stageCount === 2) {
        secondStageStarted.resolve();
        await releaseSecondStage.promise;
      }
      return originalStage(input);
    };
    const controller = createController(harness.repository);

    controller.start();
    const ready = await waitForState(
      controller,
      (state) => state.status === "ready",
    );

    if (ready.status !== "ready" || !ready.workspaceSyntax) {
      throw new Error("syntax fixture did not load");
    }

    const firstSource = ready.workspaceSyntax.source.replace(
      'label = "定义"',
      'label = "第一版定义"',
    );
    const secondSource = ready.workspaceSyntax.source.replace(
      'label = "定义"',
      'label = "第二版定义"',
    );
    const activeFileId = ready.syntaxCatalog.activeFileId!;
    const firstSave = controller.updateSyntaxFileSource(activeFileId, firstSource);

    await firstStageStarted.promise;
    const secondSave = controller.updateSyntaxFileSource(activeFileId, secondSource);

    releaseFirstStage.resolve();
    await secondStageStarted.promise;
    updateNote(controller, "标题\n第二版语法 stage 期间的编辑");
    releaseSecondStage.resolve();

    await Promise.all([firstSave, secondSave]);
    await controller.flushPendingChanges();

    const activeSyntaxFile = harness.getLocalContent().syntax.files.find(
      ({ id }) => id === harness.getLocalContent().syntax.activeFileId,
    );
    expect(activeSyntaxFile?.source).toBe(secondSource);
    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "第二版语法 stage 期间的编辑",
    );
    controller.dispose();
  });

  it("recanonicalizes configured notes before publishing a structural syntax change", async () => {
    const editableSource = "Title\nRoot\n\t? Open\n\tBody\n\t?";
    const harness = createRepositoryHarness({
      initialSnapshot: createSnapshot({
        content: createContent("Structural syntax", editableSource),
      }),
    });
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready" || !ready.syntaxCatalog.activeFileId) {
      throw new Error("syntax fixture did not load");
    }
    const syntaxSave = controller.updateSyntaxFileSource(
      ready.syntaxCatalog.activeFileId,
      formatSyntaxProfileToml(questionMultilineSyntaxProfile),
    );
    const configuredState = controller.getState();

    if (configuredState.status !== "ready") {
      throw new Error("structural syntax was not published synchronously");
    }

    const note = configuredState.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("syntax conversion removed the active note");
    }

    const converted = parseCtnCanonicalDocument(
      note.source,
      questionMultilineSyntaxProfile,
    );

    expect(converted.blocks.map(({ id }) => id)).toHaveLength(3);
    expect(createCtnEditableSource(
      note.source,
      questionMultilineSyntaxProfile,
    ).source).toBe(editableSource);

    const appendedSource = `${editableSource}\nAfter`;
    controller.commands.updateNoteSource(note.id, {
      edits: [{
        from: editableSource.length,
        insertedText: "\nAfter",
        to: editableSource.length,
      }],
      source: appendedSource,
    });

    await syntaxSave;
    await controller.flushPendingChanges();
    const stagedNote = harness.getLocalContent().workspace.notes[0];

    expect(createCtnEditableSource(
      stagedNote?.source ?? "",
      questionMultilineSyntaxProfile,
    ).source).toBe(appendedSource);
    expect(parseCtnCanonicalDocument(
      stagedNote?.source ?? "",
      questionMultilineSyntaxProfile,
    ).blocks).toHaveLength(4);
    controller.dispose();
  });

  it("surfaces a local stage error so repository switching can be blocked", async () => {
    const harness = createRepositoryHarness();
    harness.repository.stageSnapshot = async () => {
      throw new Error("insufficient local storage");
    };
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n无法落盘");

    await expect(controller.flushPendingChanges()).rejects.toThrow(
      "insufficient local storage",
    );
    expect(controller.getState()).toMatchObject({
      persistence: {
        localCopySafe: false,
        phase: "local",
        status: "error",
      },
      status: "ready",
    });
    controller.dispose();
  });

  it("quiesces commands for repository removal and can resume after deletion fails", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n删除前的本地修改");

    const preparation = await controller.prepareForRepositoryRemoval();

    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "删除前的本地修改",
    );
    expect(() => updateNote(controller, "标题\n删除期间不得编辑")).toThrow(
      WorkspaceSessionUnavailableError,
    );

    preparation.resume();
    updateNote(controller, "标题\n删除失败后继续编辑");
    await controller.flushPendingChanges();

    expect(harness.getLocalContent().workspace.notes[0]?.source).toContain(
      "删除失败后继续编辑",
    );
    controller.dispose();
  });

  it("keeps the session usable when repository removal cannot stage locally", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    harness.repository.stageSnapshot = async () => {
      throw new Error("local stage failed");
    };
    updateNote(controller, "标题\n尚未落盘");

    await expect(controller.prepareForRepositoryRemoval()).rejects.toThrow(
      "local stage failed",
    );
    expect(() => updateNote(controller, "标题\n仍然可编辑")).not.toThrow();
    controller.dispose();
  });
});
