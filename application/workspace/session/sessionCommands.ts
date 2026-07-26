import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceFolder as createWorkspaceFolderAction,
  createWorkspaceNote as createWorkspaceNoteAction,
  deleteWorkspaceFolder as deleteWorkspaceFolderAction,
  deleteWorkspaceNote as deleteWorkspaceNoteAction,
  moveWorkspaceTreeNode as moveWorkspaceTreeNodeAction,
  renameWorkspaceFolder as renameWorkspaceFolderAction,
  renameWorkspaceNote as renameWorkspaceNoteAction,
  updateWorkspaceRawNoteSource as updateWorkspaceRawNoteSourceAction,
  updateWorkspaceNoteSource as updateWorkspaceNoteSourceAction,
} from "../../../core/workspace/commands/workspaceCommands";
import {
  moveWorkspaceStructureBlockBetweenNotes as moveWorkspaceStructureBlockBetweenNotesAction,
  moveWorkspaceStructureBlockWithinNote as moveWorkspaceStructureBlockWithinNoteAction,
  type MoveWorkspaceStructureBlockBetweenNotesFailureReason,
  type MoveWorkspaceStructureBlockWithinNoteFailureReason,
  type WorkspaceStructureBlockMoveBetweenNotesRequest,
  type WorkspaceStructureBlockMoveWithinNoteRequest,
} from "../../../core/workspace/commands/structureBlockCommands";
import type {
  FolderId,
  NoteId,
  WorkspaceData,
} from "../../../core/workspace/model/workspaceData";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types";
import type { CtnEditableSourceChange } from "../../../core/ctn/metadata/textEdits";
import { readCtnCanonicalTitleHeader } from "../../../core/ctn/parser/parseCtnDocument";
import type {
  WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";

type CreateWorkspaceNoteCommand = Parameters<typeof createWorkspaceNoteAction>[1];
type CreateWorkspaceFolderCommand = Parameters<
  typeof createWorkspaceFolderAction
>[1];
type WorkspaceStructureBlockMoveIndex = Parameters<
  typeof moveWorkspaceStructureBlockBetweenNotesAction
>[1];
type MoveWorkspaceTreeNodeCommand = Parameters<
  typeof moveWorkspaceTreeNodeAction
>[1];
type MoveWorkspaceStructureBlockBetweenNotesCommandResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
    }
  | {
      reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason;
      status: "failed";
      targetNoteId?: never;
    };
type MoveWorkspaceStructureBlockWithinNoteCommandResult =
  | {
      noteId: NoteId;
      status: "moved";
    }
  | {
      noteId?: never;
      reason: MoveWorkspaceStructureBlockWithinNoteFailureReason;
      status: "failed";
    };

export type WorkspaceNoteSourceUpdateResult = {
  authoritativeSource: string;
  titleNormalized: boolean;
};

export type SessionCommands = {
  createFolder: (
    parentFolderId: CreateWorkspaceFolderCommand["parentFolderId"],
    title: CreateWorkspaceFolderCommand["title"],
  ) => FolderId;
  createNote: (
    parentFolderId: CreateWorkspaceNoteCommand["parentFolderId"],
  ) => NoteId;
  deleteFolder: (folderId: FolderId) => void;
  deleteNote: (noteId: NoteId) => void;
  moveStructureBlockBetweenNotes: (
    index: WorkspaceStructureBlockMoveIndex,
    request: WorkspaceStructureBlockMoveBetweenNotesRequest,
  ) => MoveWorkspaceStructureBlockBetweenNotesCommandResult;
  moveStructureBlockWithinNote: (
    index: WorkspaceStructureBlockMoveIndex,
    request: WorkspaceStructureBlockMoveWithinNoteRequest,
  ) => MoveWorkspaceStructureBlockWithinNoteCommandResult;
  moveTreeNode: (request: MoveWorkspaceTreeNodeCommand) => void;
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
  const collectReservedBlockIds = (
    syntax: CtnCompiledSyntax | null,
  ) => {
    if (!syntax) {
      return new Set(
        [...getWorkspace().noteEntryById.values()].map(
          ({ note }) =>
            readCtnCanonicalTitleHeader(note.source).metadata.id,
        ),
      );
    }
    const index = getAnalysisIndex();

    if (!index || index.syntax.analysisKey !== syntax.analysisKey) {
      throw new Error(
        "Workspace analysis index is unavailable for the active syntax.",
      );
    }
    return index.blockIds;
  };

  return {
    createFolder(parentFolderId, title) {
      const folderId = dependencies.createFolderId();
      const workspace = getWorkspace();

      commitDataSnapshot(
        createWorkspaceFolderAction(workspace, {
          folderId,
          parentFolderId,
          title,
        }),
      );
      return folderId;
    },
    createNote(parentFolderId) {
      const noteId = dependencies.createNoteId();
      const workspace = getWorkspace();
      const syntax = getSyntax();

      commitDataSnapshot(
        createWorkspaceNoteAction(workspace, {
          createBlockId: dependencies.createBlockId,
          noteId,
          parentFolderId,
          reservedBlockIds: collectReservedBlockIds(syntax),
          syntax,
          timestamp: dependencies.now(),
        }),
      );
      return noteId;
    },
    deleteFolder(folderId) {
      commitDataSnapshot(
        deleteWorkspaceFolderAction(getWorkspace(), folderId),
      );
    },
    deleteNote(noteId) {
      commitDataSnapshot(deleteWorkspaceNoteAction(getWorkspace(), noteId));
    },
    moveStructureBlockBetweenNotes(index, request) {
      const result = moveWorkspaceStructureBlockBetweenNotesAction(
        getWorkspace(),
        index,
        request,
        dependencies.now(),
      );

      if (result.status !== "moved") {
        return {
          reason: result.reason,
          status: "failed",
        };
      }

      commitDataSnapshot(result.workspaceData, result.analysisOverrides);

      return {
        status: "moved",
        targetNoteId: result.targetNoteId,
      };
    },
    moveStructureBlockWithinNote(index, request) {
      const result = moveWorkspaceStructureBlockWithinNoteAction(
        getWorkspace(),
        index,
        request,
        dependencies.now(),
      );

      if (result.status !== "moved") {
        return {
          reason: result.reason,
          status: "failed",
        };
      }

      commitDataSnapshot(result.workspaceData, result.analysisOverrides);

      return {
        noteId: result.noteId,
        status: "moved",
      };
    },
    moveTreeNode(request) {
      commitDataSnapshot(
        moveWorkspaceTreeNodeAction(getWorkspace(), request),
      );
    },
    renameFolder(folderId, title) {
      commitDataSnapshot(
        renameWorkspaceFolderAction(getWorkspace(), folderId, title),
      );
    },
    renameNote(noteId, title) {
      commitDataSnapshot(
        renameWorkspaceNoteAction(
          getWorkspace(),
          noteId,
          title,
          dependencies.now(),
        ),
      );
    },
    updateNoteSource(noteId, change) {
      const workspace = getWorkspace();
      const syntax = getSyntax();

      if (!syntax) {
        const nextWorkspace = updateWorkspaceRawNoteSourceAction(
          workspace,
          noteId,
          change,
          dependencies.now(),
        );
        const authoritativeSource = nextWorkspace.notes.find(
          ({ id }) => id === noteId,
        )?.source;

        if (authoritativeSource === undefined) {
          throw new Error(`Workspace note does not exist: ${noteId}`);
        }

        commitDataSnapshot(nextWorkspace);
        return {
          authoritativeSource,
          titleNormalized:
            readCtnCanonicalTitleHeader(authoritativeSource).title !==
              readCtnCanonicalTitleHeader(change.source).title,
        };
      }

      const index = getAnalysisIndex();
      const previousAnalysis = index?.getParsedNote(noteId)?.analysis;

      if (!index || !previousAnalysis) {
        throw new Error(
          `Workspace note analysis does not exist: ${noteId}`,
        );
      }
      const result = updateWorkspaceNoteSourceAction(
        workspace,
        noteId,
        previousAnalysis,
        change,
        dependencies.now(),
        dependencies.createBlockId,
        index.blockIds,
      );
      const canonicalSource = result.workspaceData.notes.find(
        ({ id }) => id === noteId,
      )?.source;

      if (canonicalSource === undefined) {
        throw new Error(`Workspace note does not exist: ${noteId}`);
      }

      commitDataSnapshot(
        result.workspaceData,
        new Map([[noteId, result.analysis]]),
      );
      const authoritativeSource =
        result.analysis.editableProjection.source;

      return {
        authoritativeSource,
        titleNormalized:
          authoritativeSource.split("\n", 1)[0] !==
            change.source.split("\n", 1)[0],
      };
    },
  };
}
