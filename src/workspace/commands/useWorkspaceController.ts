import { useEffect, useState } from "react";
import { findFolderIdContainingNote } from "../model/noteTree";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
} from "../model/workspaceData";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceNote,
  renameWorkspaceFolder,
  resolveExistingFolderId,
  selectWorkspaceNote,
  updateActiveWorkspaceNoteSource,
} from "../model/workspaceActions";
import {
  moveWorkspaceBlock,
  type WorkspaceBlockMigrationRequest,
} from "../workflows/blockMigrationWorkflow";
import { useWorkspaceSession } from "../session/useWorkspaceSession";
import { toWorkspaceData } from "../runtime/workspaceRuntime";

type MoveWorkspaceBlockActionResult =
  | {
      message: string;
      status: "moved";
    }
  | {
      message: string;
      status: "failed";
    };

function createLocalFolderId() {
  return `folder-${globalThis.crypto.randomUUID()}`;
}

function createLocalNoteId() {
  return `note-${Date.now()}`;
}

export function useWorkspaceController() {
  const {
    canChangeRepositoryPath,
    changeRepositoryPath,
    isWorkspaceLoaded,
    reloadWorkspace,
    repositoryPath,
    setWorkspaceData,
    storageLabel,
    syntaxFile,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  } = useWorkspaceSession();
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(defaultFolderId);
  const activeNote =
    workspace.notes.find((note) => note.id === workspace.activeNoteId) ?? null;

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveExistingFolderId(workspace, currentFolderId),
    );
  }, [workspace]);

  const selectNote = (noteId: NoteId) => {
    const folderId = findFolderIdContainingNote(workspace.tree, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    setWorkspaceData((current) => selectWorkspaceNote(current, noteId));
  };

  const selectFolder = (folderId: FolderId) => {
    setSelectedFolderId(resolveExistingFolderId(workspace, folderId));
  };

  const createNote = () => {
    const timestamp = new Date().toISOString();
    const noteId = createLocalNoteId();

    setWorkspaceData((current) =>
      createWorkspaceNote(current, {
        folderId: selectedFolderId,
        noteId,
        timestamp,
      }),
    );
  };

  const createFolder = (parentFolderId: FolderId, title: string) => {
    const folderId = createLocalFolderId();

    setWorkspaceData((current) =>
      createWorkspaceFolder(current, {
        folderId,
        parentFolderId,
        title,
      }),
    );
    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: FolderId, title: string) => {
    setWorkspaceData((current) =>
      renameWorkspaceFolder(current, folderId, title),
    );
    setSelectedFolderId(folderId);
  };

  const deleteNote = (noteId: NoteId) => {
    setWorkspaceData((current) => deleteWorkspaceNote(current, noteId));
  };

  const deleteFolder = (folderId: FolderId) => {
    setWorkspaceData((current) => deleteWorkspaceFolder(current, folderId));
    setSelectedFolderId(defaultFolderId);
  };

  const moveNote = (noteId: NoteId, targetFolderId: FolderId) => {
    setWorkspaceData((current) =>
      moveWorkspaceNote(current, noteId, targetFolderId),
    );
    setSelectedFolderId(targetFolderId);
  };

  const updateActiveNoteSource = (source: string) => {
    const timestamp = new Date().toISOString();

    setWorkspaceData((current) =>
      updateActiveWorkspaceNoteSource(current, source, timestamp),
    );
  };

  const moveNoteBlock = (
    request: WorkspaceBlockMigrationRequest,
  ): MoveWorkspaceBlockActionResult => {
    const result = moveWorkspaceBlock(
      workspace,
      request,
      new Date().toISOString(),
    );

    if (result.status !== "moved") {
      return {
        message: result.message,
        status: "failed",
      };
    }

    setWorkspaceData(toWorkspaceData(result.workspace));
    setSelectedFolderId(
      findFolderIdContainingNote(result.workspace.tree, result.targetNoteId) ??
        selectedFolderId,
    );

    return {
      message: result.message,
      status: "moved",
    };
  };

  return {
    activeNote,
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    isWorkspaceLoaded,
    moveNote,
    moveNoteBlock,
    reloadWorkspace,
    renameFolder,
    repositoryPath,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel,
    syntaxFile,
    updateActiveNoteSource,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  };
}
