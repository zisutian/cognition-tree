// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceStructureIndex,
  WorkspaceStructureBlocksMoveRequest,
  WorkspaceStructureBlocksMoveFailureReason,
  FolderId,
  NoteId,
  WorkspaceData,
  WorkspaceParseIndex,
  NoteTreeMoveRequest,
  NoteTreeBatchMoveRequest,
} from "../../../core/workspace/index.ts";
import { findAvailableDefaultNoteTitle } from "../../../core/workspace/index.ts";
import { DomainNotFoundError } from "../../../core/errors/index.ts";
import type {
  CtnCompiledSyntax,
  CtnEditableSourceChange,
  CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/index.ts";
import {
  prepareWorkspaceMutation,
  WorkspaceBlockMoveValidationError,
  WorkspaceBlockMoveNotFoundError,
  type WorkspaceDomainCommand,
} from "../commands/workspaceDomainCommands.ts";

export type SessionStructureBlocksMoveResult =
  | { status: "moved"; targetNoteId: NoteId }
  | { status: "failed"; reason: WorkspaceStructureBlocksMoveFailureReason };

export type WorkspaceNoteSourceUpdateResult = {
  authoritativeSource: string;
  titleNormalized: boolean;
};

export type SessionCommands = {
  createFolder: (
    parentFolderId: FolderId | null,
    title: string,
  ) => FolderId;
  createNote: (
    parentFolderId: FolderId | null,
  ) => NoteId;
  deleteFolder: (folderId: FolderId) => void;
  deleteNote: (noteId: NoteId) => void;
  moveStructureBlocks: (request: WorkspaceStructureBlocksMoveRequest) => SessionStructureBlocksMoveResult;
  moveTreeNodes: (request: NoteTreeBatchMoveRequest) => void;
  moveTreeNode: (request: NoteTreeMoveRequest) => void;
  renameFolder: (folderId: FolderId, title: string) => void;
  renameNote: (noteId: NoteId, title: string) => void;
  updateNoteSource: (
    noteId: NoteId,
    change: CtnEditableSourceChange,
  ) => WorkspaceNoteSourceUpdateResult;
};

export type SessionCommandDependencies = {
  createBlockId: () => string;
  createFolderId: () => FolderId;
  createNoteId: () => NoteId;
  createSyntaxFileId: () => string;
  now: () => string;
};

export function createSessionCommands({
  commitDataSnapshot,
  dependencies,
  getSyntax,
  getAnalysisIndex,
  getWorkspace,
}: {
  commitDataSnapshot: (
    workspaceData: WorkspaceData,
    analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>,
  ) => void;
  dependencies: SessionCommandDependencies;
  getSyntax: () => CtnCompiledSyntax | null;
  getAnalysisIndex: () => WorkspaceParseIndex | null;
  getWorkspace: () => WorkspaceStructureIndex;
}): SessionCommands {
  const execute = (command: WorkspaceDomainCommand) => {
    const structure = getWorkspace();
    const mutation = prepareWorkspaceMutation({
      command,
      context: {
        index: getAnalysisIndex(),
        structure,
        syntax: getSyntax(),
      },
      createBlockId: dependencies.createBlockId,
    });

    if (mutation.content !== structure.data) {
      commitDataSnapshot(mutation.content, mutation.analysisOverrides);
    }
    return mutation;
  };
  const moveTreeNodes = (request: NoteTreeBatchMoveRequest) => {
    execute({ kind: "move-tree-nodes", request, timestamp: dependencies.now() });
  };

  return {
    createFolder(parentFolderId, title) {
      const folderId = dependencies.createFolderId();
      execute({
        folderId,
        kind: "create-folder",
        parentFolderId,
        timestamp: dependencies.now(),
        title,
      });
      return folderId;
    },
    createNote(parentFolderId) {
      const noteId = dependencies.createNoteId();
      const title = findAvailableDefaultNoteTitle(getWorkspace(), parentFolderId);
      execute({
        body: "",
        kind: "create-note",
        noteId,
        parentFolderId,
        timestamp: dependencies.now(),
        title,
      });
      return noteId;
    },
    deleteFolder(folderId) {
      execute({
        folderId,
        kind: "delete-folder",
        timestamp: dependencies.now(),
      });
    },
    deleteNote(noteId) {
      execute({
        kind: "delete-note",
        noteId,
        timestamp: dependencies.now(),
      });
    },
    moveStructureBlocks(request) {
      try {
        execute({ ...request, kind: "move-blocks", timestamp: dependencies.now() });
        return { status: "moved", targetNoteId: request.targetNoteId };
      } catch (error) {
        if (error instanceof WorkspaceBlockMoveValidationError || error instanceof WorkspaceBlockMoveNotFoundError) {
          return { status: "failed", reason: error.reason };
        }
        if (error instanceof DomainNotFoundError) {
          return { status: "failed", reason: "missing-note" };
        }
        throw error;
      }
    },
    moveTreeNodes,
    moveTreeNode(request) {
      moveTreeNodes({ destination: request.destination, sources: [request.source] });
    },
    renameFolder(folderId, title) {
      execute({
        folderId,
        kind: "rename-folder",
        timestamp: dependencies.now(),
        title,
      });
    },
    renameNote(noteId, title) {
      execute({
        kind: "rename-note",
        noteId,
        timestamp: dependencies.now(),
        title,
      });
    },
    updateNoteSource(noteId, change) {
      const hasSyntax = getSyntax() !== null;
      const result = execute({
        change,
        kind: "replace-note-source",
        noteId,
        timestamp: dependencies.now(),
      });
      const canonicalSource = result.content.notes.find(
        ({ id }) => id === noteId,
      )?.source;

      if (canonicalSource === undefined) {
        throw new Error(`Workspace note does not exist: ${noteId}`);
      }

      const authoritativeSource = hasSyntax
        ? result.analysisOverrides?.get(noteId)?.editableProjection.source ??
          change.source
        : canonicalSource;

      return {
        authoritativeSource,
        titleNormalized:
          authoritativeSource.split("\n", 1)[0] !==
            change.source.split("\n", 1)[0],
      };
    },
  };
}
