import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceFolder as createWorkspaceFolderAction,
  createWorkspaceNote as createWorkspaceNoteAction,
  deleteWorkspaceFolder as deleteWorkspaceFolderAction,
  deleteWorkspaceNote as deleteWorkspaceNoteAction,
  moveWorkspaceNote as moveWorkspaceNoteAction,
  moveWorkspaceTreeNode as moveWorkspaceTreeNodeAction,
  renameWorkspaceFolder as renameWorkspaceFolderAction,
  renameWorkspaceNote as renameWorkspaceNoteAction,
  updateWorkspaceNoteSource as updateWorkspaceNoteSourceAction,
} from "../../../workspace/commands/workspaceCommands";
import {
  moveWorkspaceBlock as moveWorkspaceBlockAction,
  type MoveWorkspaceBlockFailureReason,
  type WorkspaceBlockMigrationRequest,
} from "../../../workspace/commands/blockMigrationCommands";
import type {
  FolderId,
  NoteId,
  WorkspaceData,
} from "../../../workspace/model/workspaceData";

type CreateWorkspaceNoteCommand = Parameters<typeof createWorkspaceNoteAction>[1];
type CreateWorkspaceFolderCommand = Parameters<
  typeof createWorkspaceFolderAction
>[1];
type WorkspaceBlockMigrationIndex = Parameters<
  typeof moveWorkspaceBlockAction
>[1];
type MoveWorkspaceTreeNodeCommand = Parameters<
  typeof moveWorkspaceTreeNodeAction
>[1];
type MoveWorkspaceBlockCommandResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
    }
  | {
      reason: MoveWorkspaceBlockFailureReason;
      status: "failed";
      targetNoteId?: never;
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
  moveBlock: (
    index: WorkspaceBlockMigrationIndex,
    request: WorkspaceBlockMigrationRequest,
  ) => MoveWorkspaceBlockCommandResult;
  moveNote: (noteId: NoteId, targetFolderId: FolderId | null) => void;
  moveTreeNode: (request: MoveWorkspaceTreeNodeCommand) => void;
  renameFolder: (folderId: FolderId, title: string) => void;
  renameNote: (noteId: NoteId, title: string) => void;
  updateNoteSource: (noteId: NoteId, source: string) => void;
};

function createFolderId() {
  return `folder-${globalThis.crypto.randomUUID()}`;
}

function createNoteId() {
  return `note-${globalThis.crypto.randomUUID()}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

export function createSessionCommands({
  commitDataSnapshot,
  workspace,
}: {
  commitDataSnapshot: (workspaceData: WorkspaceData) => void;
  workspace: WorkspaceStructureIndex;
}): SessionCommands {
  return {
    createFolder(parentFolderId, title) {
      const folderId = createFolderId();

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
      const noteId = createNoteId();

      commitDataSnapshot(
        createWorkspaceNoteAction(workspace, {
          noteId,
          parentFolderId,
          timestamp: createTimestamp(),
        }),
      );
      return noteId;
    },
    deleteFolder(folderId) {
      commitDataSnapshot(deleteWorkspaceFolderAction(workspace, folderId));
    },
    deleteNote(noteId) {
      commitDataSnapshot(deleteWorkspaceNoteAction(workspace, noteId));
    },
    moveBlock(index, request) {
      const result = moveWorkspaceBlockAction(
        workspace,
        index,
        request,
        createTimestamp(),
      );

      if (result.status !== "moved") {
        return {
          reason: result.reason,
          status: "failed",
        };
      }

      commitDataSnapshot(result.workspaceData);

      return {
        status: "moved",
        targetNoteId: result.targetNoteId,
      };
    },
    moveNote(noteId, targetFolderId) {
      commitDataSnapshot(
        moveWorkspaceNoteAction(workspace, noteId, targetFolderId),
      );
    },
    moveTreeNode(request) {
      commitDataSnapshot(moveWorkspaceTreeNodeAction(workspace, request));
    },
    renameFolder(folderId, title) {
      commitDataSnapshot(
        renameWorkspaceFolderAction(workspace, folderId, title),
      );
    },
    renameNote(noteId, title) {
      commitDataSnapshot(
        renameWorkspaceNoteAction(
          workspace,
          noteId,
          title,
          createTimestamp(),
        ),
      );
    },
    updateNoteSource(noteId, source) {
      commitDataSnapshot(
        updateWorkspaceNoteSourceAction(
          workspace,
          noteId,
          source,
          createTimestamp(),
        ),
      );
    },
  };
}
