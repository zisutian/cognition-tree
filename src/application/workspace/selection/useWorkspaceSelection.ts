import { useCallback, useEffect, useReducer } from "react";
import type { FolderId } from "../../../../core/workspace/model/workspaceData";
import {
  collectWorkspaceNoteIdsInFolder,
  findWorkspaceNote,
  listWorkspaceNotes,
} from "../../../../core/workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
} from "../projection/viewTree";
import type { WorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import { resolveFolderSelection } from "./resolveFolderSelection";
import {
  createWorkspaceTreeMoveDestination,
  createWorkspaceTreeNodeReference,
} from "./sidebarTreeMove";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
} from "./viewSelection";

export type WorkspaceDirectoryMutations = {
  deleteFolder: (folderId: UiFolderId) => void;
  deleteNote: (noteId: UiNoteId) => void;
  moveTreeNode: (request: UiTreeMoveRequest) => void;
  renameFolder: (folderId: UiFolderId, title: string) => void;
  renameNote: (noteId: UiNoteId, title: string) => void;
};

export type WorkspaceSelection = WorkspaceDirectoryMutations & {
  activeFolderId: UiFolderId | null;
  activeNode: UiDirectoryActiveNode | null;
  activeNoteId: UiNoteId | null;
  clearFolderSelection: () => void;
  createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
  createNote: () => void;
  selectFolder: (folderId: UiFolderId) => void;
  selectNote: (noteId: UiNoteId) => void;
};

type SelectionState = {
  activeNode: UiDirectoryActiveNode | null;
  activeNoteId: UiNoteId | null;
};

type SelectionAction =
  | { node: UiDirectoryActiveNode | null; type: "activate-node" }
  | { noteId: UiNoteId | null; type: "activate-note" }
  | {
      activeNode: UiDirectoryActiveNode | null;
      activeNoteId: UiNoteId | null;
      type: "reconcile";
    };

function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "activate-node":
      return action.node?.kind === "note"
        ? { activeNode: action.node, activeNoteId: action.node.noteId }
        : { ...state, activeNode: action.node };
    case "activate-note":
      return {
        activeNode: action.noteId
          ? { kind: "note", noteId: action.noteId }
          : null,
        activeNoteId: action.noteId,
      };
    case "reconcile":
      if (
        state.activeNoteId === action.activeNoteId &&
        ((state.activeNode === null && action.activeNode === null) ||
          (state.activeNode?.kind === "note" &&
            action.activeNode?.kind === "note" &&
            state.activeNode.noteId === action.activeNode.noteId) ||
          (state.activeNode?.kind === "folder" &&
            action.activeNode?.kind === "folder" &&
            state.activeNode.folderId === action.activeNode.folderId))
      ) {
        return state;
      }

      return {
        activeNode: action.activeNode,
        activeNoteId: action.activeNoteId,
      };
  }
}

function resolveActiveNode(
  workspace: WorkspaceStructureIndex,
  activeNode: UiDirectoryActiveNode | null,
  activeNoteId: UiNoteId | null,
) {
  if (
    activeNode?.kind === "note" &&
    findWorkspaceNote(workspace, activeNode.noteId)
  ) {
    return activeNode;
  }

  if (
    activeNode?.kind === "folder" &&
    resolveFolderSelection(workspace, activeNode.folderId) ===
      activeNode.folderId
  ) {
    return activeNode;
  }

  return activeNoteId ? { kind: "note" as const, noteId: activeNoteId } : null;
}

export function useWorkspaceSelection({
  commands,
  workspace,
}: {
  commands: SessionCommands;
  workspace: WorkspaceStructureIndex;
}): WorkspaceSelection {
  const notes = listWorkspaceNotes(workspace);
  const [selection, dispatch] = useReducer(selectionReducer, {
    activeNode: null,
    activeNoteId: null,
  });
  const activeFolderId =
    selection.activeNode?.kind === "folder"
      ? selection.activeNode.folderId
      : null;

  useEffect(() => {
    const activeNoteId = resolveActiveNoteId(notes, selection.activeNoteId);

    dispatch({
      activeNode: resolveActiveNode(
        workspace,
        selection.activeNode,
        activeNoteId,
      ),
      activeNoteId,
      type: "reconcile",
    });
  }, [notes, selection.activeNode, selection.activeNoteId, workspace]);

  const selectNote = useCallback(
    (noteId: UiNoteId) => {
      if (findWorkspaceNote(workspace, noteId)) {
        dispatch({ noteId, type: "activate-note" });
      }
    },
    [workspace],
  );

  const selectFolder = (folderId: UiFolderId) => {
    const nextFolderId = resolveFolderSelection(workspace, folderId);

    dispatch({
      node: nextFolderId
        ? { folderId: nextFolderId, kind: "folder" }
        : null,
      type: "activate-node",
    });
  };

  const clearFolderSelection = useCallback(() => {
    dispatch({ noteId: selection.activeNoteId, type: "activate-note" });
  }, [selection.activeNoteId]);

  const createNote = () => {
    const noteId = commands.createNote(activeFolderId);

    dispatch({ noteId, type: "activate-note" });
  };

  const createFolder = (parentFolderId: UiFolderId | null, title: string) => {
    const folderId = commands.createFolder(parentFolderId, title);

    dispatch({ node: { folderId, kind: "folder" }, type: "activate-node" });
  };

  const renameFolder = (folderId: UiFolderId, title: string) => {
    commands.renameFolder(folderId, title);
    dispatch({ node: { folderId, kind: "folder" }, type: "activate-node" });
  };

  const renameNote = (noteId: UiNoteId, title: string) => {
    commands.renameNote(noteId, title);
    dispatch({ noteId, type: "activate-note" });
  };

  const deleteNote = (noteId: UiNoteId) => {
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNote(
      notes,
      selection.activeNoteId,
      noteId,
    );

    commands.deleteNote(noteId);
    dispatch({
      activeNode:
        selection.activeNode?.kind === "note" &&
        selection.activeNode.noteId === noteId
          ? nextActiveNoteId
            ? { kind: "note", noteId: nextActiveNoteId }
            : null
          : selection.activeNode,
      activeNoteId: nextActiveNoteId,
      type: "reconcile",
    });
  };

  const deleteFolder = (folderId: UiFolderId) => {
    const removedNoteIds = new Set(
      collectWorkspaceNoteIdsInFolder(workspace, folderId),
    );
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNotes(
      notes,
      selection.activeNoteId,
      removedNoteIds,
    );
    const activeNode = selection.activeNode;
    const nextActiveNode =
      activeNode?.kind === "folder" && activeNode.folderId === folderId
        ? nextActiveNoteId
          ? { kind: "note" as const, noteId: nextActiveNoteId }
          : null
        : activeNode?.kind === "note" && removedNoteIds.has(activeNode.noteId)
          ? nextActiveNoteId
            ? { kind: "note" as const, noteId: nextActiveNoteId }
            : null
          : activeNode;

    commands.deleteFolder(folderId);
    dispatch({
      activeNode: nextActiveNode,
      activeNoteId: nextActiveNoteId,
      type: "reconcile",
    });
  };

  const moveTreeNode = (request: UiTreeMoveRequest) => {
    commands.moveTreeNode({
      destination: createWorkspaceTreeMoveDestination(request.destination),
      source: createWorkspaceTreeNodeReference(request.source),
    });
  };

  return {
    activeFolderId: activeFolderId as FolderId | null,
    activeNode: selection.activeNode,
    activeNoteId: selection.activeNoteId,
    clearFolderSelection,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    moveTreeNode,
    renameFolder,
    renameNote,
    selectFolder,
    selectNote,
  };
}
