import { useCallback, useEffect, useState } from "react";
import type { FolderId } from "../../../workspace/model/workspaceData";
import {
  collectWorkspaceNoteIdsInFolder,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  listWorkspaceNotes,
} from "../../../workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
} from "../projection/viewTree";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import { resolveFolderSelection } from "./resolveFolderSelection";
import { createWorkspaceTreeNodeReference } from "./sidebarTreeMove";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
} from "./viewSelection";

export type WorkspaceDirectoryMutations = {
  deleteFolder: (folderId: UiFolderId) => void;
  deleteNote: (noteId: UiNoteId) => void;
  renameFolder: (folderId: UiFolderId, title: string) => void;
  renameNote: (noteId: UiNoteId, title: string) => void;
};

export type WorkspaceSelection = WorkspaceDirectoryMutations & {
  activeFolderId: UiFolderId | null;
  activeNode: UiDirectoryActiveNode | null;
  activeNoteId: UiNoteId | null;
  createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
  createNote: () => void;
  moveTreeNode: (request: UiTreeMoveRequest) => void;
  selectFolder: (folderId: UiFolderId) => void;
  selectNote: (noteId: UiNoteId) => void;
};

export function useWorkspaceSelection({
  commands,
  workspace,
}: {
  commands: SessionCommands;
  workspace: WorkspaceStructureIndex;
}): WorkspaceSelection {
  const notes = listWorkspaceNotes(workspace);
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId | null>(null);
  const [directoryActiveNode, setDirectoryActiveNode] =
    useState<UiDirectoryActiveNode | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<UiNoteId | null>(null);

  useEffect(() => {
    setActiveNoteId((currentNoteId) =>
      resolveActiveNoteId(notes, currentNoteId),
    );
  }, [notes]);

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveFolderSelection(workspace, currentFolderId),
    );
  }, [workspace]);

  useEffect(() => {
    setDirectoryActiveNode((currentNode) => {
      if (
        currentNode?.kind === "note" &&
        findWorkspaceNote(workspace, currentNode.noteId)
      ) {
        return currentNode;
      }

      if (
        currentNode?.kind === "folder" &&
        resolveFolderSelection(workspace, currentNode.folderId) ===
          currentNode.folderId
      ) {
        return currentNode;
      }

      return activeNoteId
        ? { kind: "note", noteId: activeNoteId }
        : null;
    });
  }, [activeNoteId, workspace]);

  const selectNote = useCallback((noteId: UiNoteId) => {
    if (!findWorkspaceNote(workspace, noteId)) {
      return;
    }

    setSelectedFolderId(
      findWorkspaceFolderIdContainingNote(workspace, noteId),
    );
    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  }, [workspace]);

  const selectFolder = (folderId: UiFolderId) => {
    const nextFolderId = resolveFolderSelection(workspace, folderId);

    setSelectedFolderId(nextFolderId);
    setDirectoryActiveNode(
      nextFolderId ? { folderId: nextFolderId, kind: "folder" } : null,
    );
  };

  const createNote = () => {
    const noteId = commands.createNote(selectedFolderId);

    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  };

  const createFolder = (parentFolderId: UiFolderId | null, title: string) => {
    const folderId = commands.createFolder(parentFolderId, title);

    setSelectedFolderId(folderId);
    setDirectoryActiveNode({ folderId, kind: "folder" });
  };

  const renameFolder = (folderId: UiFolderId, title: string) => {
    commands.renameFolder(folderId, title);
    setSelectedFolderId(folderId);
    setDirectoryActiveNode({ folderId, kind: "folder" });
  };

  const renameNote = (noteId: UiNoteId, title: string) => {
    commands.renameNote(noteId, title);
    setActiveNoteId(noteId);
    setDirectoryActiveNode({ kind: "note", noteId });
  };

  const deleteNote = (noteId: UiNoteId) => {
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNote(
      notes,
      activeNoteId,
      noteId,
    );

    commands.deleteNote(noteId);
    setActiveNoteId(nextActiveNoteId);
    setDirectoryActiveNode((currentNode) =>
      currentNode?.kind === "note" && currentNode.noteId === noteId
        ? nextActiveNoteId
          ? { kind: "note", noteId: nextActiveNoteId }
          : null
        : currentNode,
    );
  };

  const deleteFolder = (folderId: UiFolderId) => {
    const removedNoteIds = new Set(
      collectWorkspaceNoteIdsInFolder(workspace, folderId),
    );
    const nextActiveNoteId = resolveActiveNoteIdAfterRemovingNotes(
      notes,
      activeNoteId,
      removedNoteIds,
    );

    commands.deleteFolder(folderId);
    setSelectedFolderId(null);
    setActiveNoteId(nextActiveNoteId);
    setDirectoryActiveNode((currentNode) =>
      currentNode?.kind === "folder" && currentNode.folderId === folderId
        ? nextActiveNoteId
          ? { kind: "note", noteId: nextActiveNoteId }
          : null
        : currentNode?.kind === "note" && removedNoteIds.has(currentNode.noteId)
          ? nextActiveNoteId
            ? { kind: "note", noteId: nextActiveNoteId }
            : null
          : currentNode,
    );
  };

  const moveTreeNode = (request: UiTreeMoveRequest) => {
    commands.moveTreeNode({
      placement: request.placement,
      source: createWorkspaceTreeNodeReference(request.source),
      target: createWorkspaceTreeNodeReference(request.target),
    });
  };

  return {
    activeFolderId: selectedFolderId,
    activeNode: directoryActiveNode,
    activeNoteId,
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
