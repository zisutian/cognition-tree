// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
  CtnEditableSourceChange,
  CtnCompiledSyntax,
} from "../../../core/ctn/index.ts";
import {
  createMyersTextEdits,
} from "../../../core/ctn/index.ts";

import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../core/errors/index.ts";
import {
  collectWorkspaceTitleBlockIds,
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceTreeNodes,
  renameWorkspaceFolder,
  renameWorkspaceNote,
  updateWorkspaceNoteSource,
  updateWorkspaceRawNoteSource,
  moveWorkspaceStructureBlocks,
  type WorkspaceStructureBlockTarget,
  type WorkspaceStructureBlocksMoveFailureReason,
  createWorkspaceParseIndex,
  type WorkspaceParseIndex,
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../core/workspace/index.ts";





import type {
  FolderId,
  NoteId,
  WorkspaceData,
  NoteTreeBatchMoveRequest,
  WorkspaceCommandOutcome,
} from "../../../core/workspace/index.ts";


import {
  assertDomainResourceVersion,
} from "../../commands/index.ts";

type ResourceVersion = `sha256:${string}`;

export type WorkspaceDomainVersions = {
  folder(folderId: string, title: string): ResourceVersion;
  note(source: string): ResourceVersion;
  tree(workspace: WorkspaceData): ResourceVersion;
};

type ExpectedNoteVersion = {
  expectedVersion?: ResourceVersion;
  noteId: NoteId;
};

export type WorkspaceBlockTarget = WorkspaceStructureBlockTarget;

export class WorkspaceBlockMoveNotFoundError extends DomainNotFoundError {
  readonly reason: WorkspaceStructureBlocksMoveFailureReason;
  constructor(reason: WorkspaceStructureBlocksMoveFailureReason, resourceId: string) {
    super(resourceId, `Workspace block move failed: ${reason}`);
    this.reason = reason;
  }
}

export class WorkspaceBlockMoveValidationError extends DomainValidationError {
  readonly reason: WorkspaceStructureBlocksMoveFailureReason;
  constructor(reason: WorkspaceStructureBlocksMoveFailureReason) {
    super(`Workspace block move failed: ${reason}`);
    this.name = "WorkspaceBlockMoveValidationError";
    this.reason = reason;
  }
}

export type WorkspaceDomainCommand =
  | {
      expectedTreeVersion?: ResourceVersion;
      folderId: FolderId;
      kind: "create-folder";
      parentFolderId: FolderId | null;
      timestamp: string;
      title: string;
    }
  | {
      body: string;
      expectedTreeVersion?: ResourceVersion;
      kind: "create-note";
      noteId: NoteId;
      parentFolderId: FolderId | null;
      timestamp: string;
      title: string;
    }
  | {
      expectedTreeVersion?: ResourceVersion;
      folderId: FolderId;
      kind: "delete-folder";
      timestamp: string;
    }
  | (ExpectedNoteVersion & {
      kind: "delete-note";
      timestamp: string;
    })
  | {
      expectedSourceVersion?: ResourceVersion;
      expectedTargetVersion?: ResourceVersion;
      kind: "move-blocks";
      sourceBlockIds: readonly string[];
      sourceNoteId: NoteId;
      target: WorkspaceBlockTarget;
      targetNoteId: NoteId;
      timestamp: string;
    }
  | {
      expectedTreeVersion?: ResourceVersion;
      kind: "move-tree-nodes";
      request: NoteTreeBatchMoveRequest;
      timestamp: string;
    }
  | {
      expectedVersion?: ResourceVersion;
      folderId: FolderId;
      kind: "rename-folder";
      timestamp: string;
      title: string;
    }
  | (ExpectedNoteVersion & {
      kind: "rename-note";
      timestamp: string;
      title: string;
    })
  | (ExpectedNoteVersion & {
      change: CtnEditableSourceChange;
      kind: "replace-note-source";
      timestamp: string;
    });

export type WorkspaceDomainContext = {
  index: WorkspaceParseIndex | null;
  structure: WorkspaceStructureIndex;
  syntax: CtnCompiledSyntax | null;
};

export type PreparedWorkspaceMutation = {
  analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
  content: WorkspaceData;
  context: WorkspaceDomainContext;
  outcome: WorkspaceCommandOutcome;
  timestamp: string;
};

export function createWorkspaceDomainContext({
  analysisOverrides,
  previousIndex,
  syntax,
  workspace,
}: {
  analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
  previousIndex?: WorkspaceParseIndex | null;
  syntax: CtnCompiledSyntax | null;
  workspace: WorkspaceData;
}): WorkspaceDomainContext {
  const structure = createWorkspaceStructureIndex(workspace);

  return {
    index: syntax
      ? createWorkspaceParseIndex(
          { analysisOverrides, syntax, workspace: structure },
          previousIndex,
        )
      : null,
    structure,
    syntax,
  };
}
function requireNote(context: WorkspaceDomainContext, noteId: NoteId) {
  const entry = context.structure.noteEntryById.get(noteId);

  if (!entry) {
    throw new DomainNotFoundError(noteId, "Workspace note does not exist");
  }
  return entry;
}

function requireFolder(context: WorkspaceDomainContext, folderId: FolderId) {
  const entry = context.structure.folderEntryById.get(folderId);

  if (!entry) {
    throw new DomainNotFoundError(folderId, "Workspace folder does not exist");
  }
  return entry;
}

function assertTreeVersion(
  expected: ResourceVersion | undefined,
  context: WorkspaceDomainContext,
  versions?: WorkspaceDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    expected,
    versions.tree(context.structure.data),
    "tree",
  );
}

function assertNoteVersion(
  expected: ResourceVersion | undefined,
  source: string,
  noteId: string,
  versions?: WorkspaceDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(expected, versions.note(source), noteId);
}

function assertFolderVersion(
  expected: ResourceVersion | undefined,
  folderId: string,
  title: string,
  versions?: WorkspaceDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    expected,
    versions.folder(folderId, title),
    folderId,
  );
}

function updateWorkspaceEditableSource({
  change,
  context,
  createBlockId,
  noteId,
  timestamp,
}: {
  change: CtnEditableSourceChange;
  context: WorkspaceDomainContext;
  createBlockId: () => string;
  noteId: NoteId;
  timestamp: string;
}) {
  const entry = requireNote(context, noteId);

  if (!context.syntax || !context.index) {
    const next = updateWorkspaceRawNoteSource(
      context.structure,
      noteId,
      change,
      timestamp,
    );
    return { content: next };
  }
  const parsed = context.index.getParsedNote(noteId);

  if (!parsed) {
    throw new DomainNotFoundError(noteId, "Workspace note does not exist");
  }
  const updated = updateWorkspaceNoteSource(
    context.structure,
    noteId,
    parsed.analysis,
    change,
    timestamp,
    createBlockId,
    context.index.blockIds,
  );

  return {
    analysisOverrides: new Map([[entry.note.id, updated.analysis]]),
    content: updated.workspaceData,
  };
}

export function createWorkspaceSourceReplacement(
  context: WorkspaceDomainContext,
  noteId: NoteId,
  editableText: string,
): CtnEditableSourceChange {
  const entry = requireNote(context, noteId);
  const parsed = context.index?.getParsedNote(noteId);
  const current = parsed
    ? parsed.analysis.editableProjection.source
    : entry.note.source;
  const next = parsed
    ? editableText
    : `${entry.note.source.split("\n", 1)[0] ?? ""}\n${editableText}`;

  return {
    edits: createMyersTextEdits(current, next),
    source: next,
  };
}

function requireSuccessfulBlockMove(result: ReturnType<typeof moveWorkspaceStructureBlocks>) {
  if (result.status === "moved") return result;
  if (result.reason === "missing-note" || result.reason === "parsed-note-missing" ||
    result.reason === "source-block-missing" || result.reason === "target-position-missing") {
    throw new WorkspaceBlockMoveNotFoundError(result.reason, result.resourceId ?? result.reason);
  }
  throw new WorkspaceBlockMoveValidationError(result.reason);
}

export function prepareWorkspaceMutation({
  command,
  context,
  createBlockId,
  versions,
}: {
  command: WorkspaceDomainCommand;
  context: WorkspaceDomainContext;
  createBlockId: () => string;
  versions?: WorkspaceDomainVersions;
}): PreparedWorkspaceMutation {
  let content: WorkspaceData;
  let analysisOverrides:
    | ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>
    | undefined;
  let outcome: WorkspaceCommandOutcome = { kind: "ok" };

  switch (command.kind) {
    case "create-folder":
      assertTreeVersion(command.expectedTreeVersion, context, versions);
      content = createWorkspaceFolder(context.structure, {
        folderId: command.folderId,
        parentFolderId: command.parentFolderId,
        title: command.title,
      });
      outcome = { folderId: command.folderId, kind: "folder-created" };
      break;
    case "create-note": {
      assertTreeVersion(command.expectedTreeVersion, context, versions);
      const reservedBlockIds = context.index?.blockIds ??
        collectWorkspaceTitleBlockIds(context.structure.data);
      let workspace = createWorkspaceNote(context.structure, {
        createBlockId,
        noteId: command.noteId,
        parentFolderId: command.parentFolderId,
        reservedBlockIds,
        syntax: context.syntax,
        timestamp: command.timestamp,
      });
      let nextContext = createWorkspaceDomainContext({
        previousIndex: context.index,
        syntax: context.syntax,
        workspace,
      });

      workspace = renameWorkspaceNote(
        nextContext.structure,
        command.noteId,
        command.title,
        command.timestamp,
      );
      nextContext = createWorkspaceDomainContext({
        previousIndex: nextContext.index,
        syntax: context.syntax,
        workspace,
      });
      const desired = `${command.title}${
        command.body ? `\n${command.body}` : ""
      }`;
      const updated = updateWorkspaceEditableSource({
        change: createWorkspaceSourceReplacement(
          nextContext,
          command.noteId,
          desired,
        ),
        context: nextContext,
        createBlockId,
        noteId: command.noteId,
        timestamp: command.timestamp,
      });

      content = updated.content;
      analysisOverrides = updated.analysisOverrides;
      outcome = { kind: "note-created", noteId: command.noteId };
      break;
    }
    case "delete-folder":
      assertTreeVersion(command.expectedTreeVersion, context, versions);
      requireFolder(context, command.folderId);
      content = deleteWorkspaceFolder(context.structure, command.folderId);
      break;
    case "delete-note": {
      const entry = requireNote(context, command.noteId);

      assertNoteVersion(
        command.expectedVersion,
        entry.note.source,
        command.noteId,
        versions,
      );
      content = deleteWorkspaceNote(context.structure, command.noteId);
      break;
    }
    case "move-blocks": {
      if (!context.index) throw new WorkspaceBlockMoveValidationError("parsed-note-missing");
      const source = requireNote(context, command.sourceNoteId);
      const target = requireNote(context, command.targetNoteId);
      assertNoteVersion(command.expectedSourceVersion, source.note.source, command.sourceNoteId, versions);
      assertNoteVersion(command.expectedTargetVersion, target.note.source, command.targetNoteId, versions);
      const moved = requireSuccessfulBlockMove(moveWorkspaceStructureBlocks(
        context.structure,
        context.index,
        command,
        command.timestamp,
      ));
      content = moved.workspaceData;
      analysisOverrides = moved.analysisOverrides;
      break;
    }
    case "move-tree-nodes":
      assertTreeVersion(command.expectedTreeVersion, context, versions);
      content = moveWorkspaceTreeNodes(context.structure, command.request);
      break;
    case "rename-folder": {
      const folder = requireFolder(context, command.folderId);

      assertFolderVersion(
        command.expectedVersion,
        folder.node.folderId,
        folder.node.title,
        versions,
      );
      content = renameWorkspaceFolder(
        context.structure,
        command.folderId,
        command.title,
      );
      break;
    }
    case "rename-note": {
      const entry = requireNote(context, command.noteId);

      assertNoteVersion(
        command.expectedVersion,
        entry.note.source,
        command.noteId,
        versions,
      );
      content = renameWorkspaceNote(
        context.structure,
        command.noteId,
        command.title,
        command.timestamp,
      );
      break;
    }
    case "replace-note-source": {
      const entry = requireNote(context, command.noteId);

      assertNoteVersion(
        command.expectedVersion,
        entry.note.source,
        command.noteId,
        versions,
      );
      const updated = updateWorkspaceEditableSource({
        change: command.change,
        context,
        createBlockId,
        noteId: command.noteId,
        timestamp: command.timestamp,
      });

      content = updated.content;
      analysisOverrides = updated.analysisOverrides;
      break;
    }
  }
  return {
    analysisOverrides,
    content,
    context: content === context.structure.data ? context : createWorkspaceDomainContext({
      analysisOverrides,
      previousIndex: context.index,
      syntax: context.syntax,
      workspace: content,
    }),
    outcome,
    timestamp: command.timestamp,
  };
}
