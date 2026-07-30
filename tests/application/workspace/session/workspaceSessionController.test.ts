import { describe, expect, it, vi } from "vitest";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../../../application/repository/workspaceRepository";
import {
  createWorkspaceSessionController,
  WorkspaceSessionUnavailableError,
  type WorkspaceSessionController,
} from "../../../../application/workspace/session/workspaceSessionController";
import {
  readCtnCanonicalTitleHeader,
} from "../../../../core/ctn/parser/parseCtnDocument";
import {
  analyzeCanonicalTestSource,
  readCanonicalTestDocument,
} from "../../../ctn/analysis/analysisTestHelpers";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../../../../core/ctn/syntax/formatter";
import {
  compileCtnSyntaxDefinition,
} from "../../../../core/ctn/syntax/compiler";
import {
  createCanonicalNoteSource,
  WorkspaceNoteHeaderError,
} from "../../../../core/workspace/model/workspaceData";
import {
  createSnapshot,
  createContent,
  draftRevision,
  initialTimestamp,
  remoteRevision,
  replaceEditableSource,
  waitForWorkspaceSessionState,
} from "./workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../../support/testApplicationScheduler";

function projectEditableSource(
  source: string,
  syntax = defaultCtnSyntax,
) {
  return analyzeCanonicalTestSource(source, syntax).editableProjection.source;
}

const questionMultilineDefinition = structuredClone(
  defaultCtnSyntax.definition,
) as import("../../../../core/ctn/syntax/types").CtnSyntaxDefinition;
questionMultilineDefinition.blocks = questionMultilineDefinition.blocks.map(
  (rule) => rule.marker === "?" ? { ...rule, kind: "multiline" } : rule,
);
const questionMultilineResult = compileCtnSyntaxDefinition(
  questionMultilineDefinition,
  "workspace",
);
if (!questionMultilineResult.syntax) {
  throw new Error("Invalid question multiline test syntax.");
}
const questionMultilineSyntax = questionMultilineResult.syntax;

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
}: {
  initialSnapshot?: WorkspaceRepositorySnapshot;
} = {}): RepositoryHarness {
  let snapshot = initialSnapshot;
  let localRevisionIndex = 0;
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
  const synchronize = vi.fn<WorkspaceRepository["synchronizePendingSnapshot"]>(
    async () => {
      const result = {
        localRevision: snapshot.localRevision,
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
        status: "synced" as const,
      };

      snapshot = {
        ...snapshot,
        conflictRevision: null,
        localRevision: result.localRevision,
        pendingChanges: result.pendingChanges,
        remoteRevision: result.remoteRevision,
      };
      return result;
    },
  );
  const repository: WorkspaceRepository = {
    discardPendingSnapshotAndReload: () => discard(),
    label: "test repository",
    loadSnapshot: () => load(),
    location: {
      hostPath: null,
      serverPath: "/repositories/test",
      type: "local",
    },
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
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: synchronize,
  };

  return {
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

describe("workspace session controller", () => {
  it("returns the canonical configured editor source and preserves it after an invalid title", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
    const state = await waitForWorkspaceSessionState(
      controller,
      (candidate) => candidate.status === "ready",
    );

    expect(state).toMatchObject({
      location: {
        hostPath: null,
        serverPath: "/repositories/test",
        type: "local",
      },
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
    const ready = await waitForWorkspaceSessionState(
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
    expect(configuredState.context?.syntax).toEqual(
      defaultCtnSyntax,
    );
    const canonicalNotes = [...configuredState.workspace.noteEntryById.values()]
      .map(({ note }) => readCanonicalTestDocument(
        note.source,
        defaultCtnSyntax,
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

    const editable = projectEditableSource(note.source);
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

    expect(projectEditableSource(
      stagedNote?.source ?? "",
    )).toBe(`Raw A\nRoot\n${rawDirective}\nNew block`);
    expect(readCanonicalTestDocument(
      stagedNote?.source ?? "",
      defaultCtnSyntax,
    ).blocks).toHaveLength(4);
    controller.dispose();
  });

  it("stages command results locally and exposes the unified persistence state", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
    updateNote(controller, "标题\n第一次");
    await controller.flushPendingChanges();

    expect(harness.stagedContents).toHaveLength(1);
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
      WorkspaceNoteHeaderError,
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

  it("publishes a valid syntax profile before awaiting persistence and rejects invalid syntax without exposure", async () => {
    const harness = createRepositoryHarness();
    const controller = createController(harness.repository);

    controller.start();
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
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
        ? updated.context?.syntax.blocks.find(
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
    const initial = await waitForWorkspaceSessionState(
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
    expect(created.workspaceSyntax?.syntax.name).toBe("默认 CTN 语法");
    expect(copyFileId).not.toBe(originalFileId);
    expect(created.syntaxCatalog.files.find(({ id }) => id === copyFileId)?.source)
      .toContain('name = "默认 CTN 语法 副本"');

    const stagedBeforeDuplicate = harness.stagedContents.length;
    const originalSource = created.syntaxCatalog.files.find(
      ({ id }) => id === originalFileId,
    )!.source;

    expect(() => controller.updateSyntaxFileSource(copyFileId, originalSource))
      .toThrow(/duplicate workspace syntax name/i);
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
    const ready = await waitForWorkspaceSessionState(
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
    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");
    const ready = controller.getState();

    if (ready.status !== "ready" || !ready.syntaxCatalog.activeFileId) {
      throw new Error("syntax fixture did not load");
    }
    const syntaxSave = controller.updateSyntaxFileSource(
      ready.syntaxCatalog.activeFileId,
      formatCtnSyntaxV2(questionMultilineSyntax.definition, "workspace"),
    );
    const configuredState = controller.getState();

    if (configuredState.status !== "ready") {
      throw new Error("structural syntax was not published synchronously");
    }

    const note = configuredState.workspace.noteEntryById.get("note-1")?.note;

    if (!note) {
      throw new Error("syntax conversion removed the active note");
    }

    const converted = readCanonicalTestDocument(
      note.source,
      questionMultilineSyntax,
    );

    expect(converted.blocks.map(({ id }) => id)).toHaveLength(3);
    expect(projectEditableSource(
      note.source,
      questionMultilineSyntax,
    )).toBe(editableSource);

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

    expect(projectEditableSource(
      stagedNote?.source ?? "",
      questionMultilineSyntax,
    )).toBe(appendedSource);
    expect(readCanonicalTestDocument(
      stagedNote?.source ?? "",
      questionMultilineSyntax,
    ).blocks).toHaveLength(4);
    controller.dispose();
  });

});
