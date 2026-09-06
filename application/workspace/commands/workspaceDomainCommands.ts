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
  moveWorkspaceTreeNode,
  renameWorkspaceFolder,
  renameWorkspaceNote,
  updateWorkspaceNoteSource,
  updateWorkspaceRawNoteSource,
  moveWorkspaceStructureBlockBetweenNotes,
  moveWorkspaceStructureBlockWithinNote,
  type WorkspaceStructureBlockTargetPositionRequest,
  createWorkspaceParseIndex,
  type WorkspaceParseIndex,
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../core/workspace/index.ts";





import type {
  FolderId,
  NoteId,
  WorkspaceData,
  NoteTreeMoveRequest,
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

export type WorkspaceBlockTarget =
  | { kind: "end" }
  | {
      kind: "above" | "below" | "inside";
      targetBlockId: string;
    };

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
      kind: "move-block";
      sourceBlockId: string;
      sourceNoteId: NoteId;
      target: WorkspaceBlockTarget;
      targetNoteId: NoteId;
      timestamp: string;
    }
  | {
      expectedTreeVersion?: ResourceVersion;
      kind: "move-tree-node";
      request: NoteTreeMoveRequest;
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

function resolveBlockTarget(
  context: WorkspaceDomainContext,
  noteId: NoteId,
  target: WorkspaceBlockTarget,
): WorkspaceStructureBlockTargetPositionRequest {
  if (target.kind === "end") return target;
  const targetBlock = context.index?.getParsedNote(noteId)?.analysis.document
    .blocks.find(({ id }) => id === target.targetBlockId);

  if (!targetBlock) {
    throw new DomainNotFoundError(
      target.targetBlockId,
      "Target Workspace block does not exist",
    );
  }
  return {
    kind: target.kind === "inside"
      ? "inside-block"
      : target.kind === "above"
        ? "sibling-above"
        : "sibling-below",
    lineNumber: targetBlock.lineNumber,
  };
}

function requireSuccessfulBlockMove(
  result:
    | ReturnType<typeof moveWorkspaceStructureBlockBetweenNotes>
    | ReturnType<typeof moveWorkspaceStructureBlockWithinNote>,
) {
  if (result.status === "moved") return result;
  if (
    result.reason === "missing-note" ||
    result.reason === "parsed-note-missing" ||
    result.reason === "source-block-missing" ||
    result.reason === "target-position-missing"
  ) {
    throw new DomainNotFoundError(
      result.reason,
      `Workspace block move failed: ${result.reason}`,
    );
  }
  throw new DomainValidationError(
    `Workspace block move failed: ${result.reason}`,
  );
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
    case "move-block": {
      if (!context.index) {
        throw new DomainValidationError(
          "Workspace block moves require an active valid syntax",
        );
      }
      const source = context.index.getParsedNote(command.sourceNoteId);
      const target = context.index.getParsedNote(command.targetNoteId);

      if (!source) {
        throw new DomainNotFoundError(
          command.sourceNoteId,
          "Source Workspace note does not exist",
        );
      }
      if (!target) {
        throw new DomainNotFoundError(
          command.targetNoteId,
          "Target Workspace note does not exist",
        );
      }
      assertNoteVersion(
        command.expectedSourceVersion,
        source.note.source,
        command.sourceNoteId,
        versions,
      );
      assertNoteVersion(
        command.expectedTargetVersion,
        target.note.source,
        command.targetNoteId,
        versions,
      );
      const sourceBlock = source.analysis.document.blocks.find(
        ({ id }) => id === command.sourceBlockId,
      );

      if (!sourceBlock) {
        throw new DomainNotFoundError(
          command.sourceBlockId,
          "Source Workspace block does not exist",
        );
      }
      const targetPosition = resolveBlockTarget(
        context,
        command.targetNoteId,
        command.target,
      );
      const moved = command.sourceNoteId === command.targetNoteId
        ? requireSuccessfulBlockMove(moveWorkspaceStructureBlockWithinNote(
            context.structure,
            context.index,
            {
              noteId: command.sourceNoteId,
              sourceBlockLineNumber: sourceBlock.lineNumber,
              targetPosition,
            },
            command.timestamp,
          ))
        : requireSuccessfulBlockMove(moveWorkspaceStructureBlockBetweenNotes(
            context.structure,
            context.index,
            {
              sourceBlockLineNumber: sourceBlock.lineNumber,
              sourceNoteId: command.sourceNoteId,
              targetNoteId: command.targetNoteId,
              targetPosition,
            },
            command.timestamp,
          ));

      content = moved.workspaceData;
      analysisOverrides = moved.analysisOverrides;
      break;
    }
    case "move-tree-node":
      assertTreeVersion(command.expectedTreeVersion, context, versions);
      content = moveWorkspaceTreeNode(context.structure, command.request);
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
    context: createWorkspaceDomainContext({
      analysisOverrides,
      previousIndex: context.index,
      syntax: context.syntax,
      workspace: content,
    }),
    outcome,
    timestamp: command.timestamp,
  };
}
