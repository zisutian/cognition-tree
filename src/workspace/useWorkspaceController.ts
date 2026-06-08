import { useEffect, useState } from "react";
import { findFolderIdContainingNote } from "../domain/noteTree";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
} from "../domain/notes";
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
  updateActiveWorkspaceNoteSyntaxProfile,
} from "../domain/workspaceActions";
import { resolveWorkspaceDefaultSyntaxProfile } from "./syntaxResolution";
import {
  moveWorkspaceBlock,
  type WorkspaceBlockMigrationRequest,
  type WorkspaceBlockMigrationTargetPositionRequest,
} from "./workspaceBlockMigration";
import { useRepositorySession } from "./useRepositorySession";

export type MoveWorkspaceBlockTargetPositionRequest =
  WorkspaceBlockMigrationTargetPositionRequest;

export type MoveWorkspaceBlockRequest = WorkspaceBlockMigrationRequest;

export type MoveWorkspaceBlockActionResult =
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
    createSyntaxFile,
    deleteSyntaxFile,
    reloadWorkspace,
    repositoryPath,
    setWorkspace,
    storageLabel,
    syntaxFiles,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
  } = useRepositorySession();
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

    setWorkspace((current) => selectWorkspaceNote(current, noteId));
  };

  const selectFolder = (folderId: FolderId) => {
    setSelectedFolderId(resolveExistingFolderId(workspace, folderId));
  };

  const createNote = () => {
    const timestamp = new Date().toISOString();
    const noteId = createLocalNoteId();

    setWorkspace((current) => {
      const syntaxResolution = resolveWorkspaceDefaultSyntaxProfile(current);

      if (syntaxResolution.status !== "resolved") {
        return current;
      }

      return createWorkspaceNote(current, {
        folderId: selectedFolderId,
        noteId,
        syntaxProfile: syntaxResolution.profile,
        timestamp,
      });
    });
  };

  const createFolder = (parentFolderId: FolderId, title: string) => {
    const folderId = createLocalFolderId();

    setWorkspace((current) =>
      createWorkspaceFolder(current, {
        folderId,
        parentFolderId,
        title,
      }),
    );
    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: FolderId, title: string) => {
    setWorkspace((current) => renameWorkspaceFolder(current, folderId, title));
    setSelectedFolderId(folderId);
  };

  const deleteNote = (noteId: NoteId) => {
    setWorkspace((current) => deleteWorkspaceNote(current, noteId));
  };

  const deleteFolder = (folderId: FolderId) => {
    setWorkspace((current) => deleteWorkspaceFolder(current, folderId));
    setSelectedFolderId(defaultFolderId);
  };

  const moveNote = (noteId: NoteId, targetFolderId: FolderId) => {
    setWorkspace((current) =>
      moveWorkspaceNote(current, noteId, targetFolderId),
    );
    setSelectedFolderId(targetFolderId);
  };

  const updateActiveNoteSource = (source: string) => {
    const timestamp = new Date().toISOString();

    setWorkspace((current) =>
      updateActiveWorkspaceNoteSource(current, source, timestamp),
    );
  };

  const updateActiveNoteSyntaxProfile = (
    syntaxProfileId: string,
    syntaxVersion: number,
  ) => {
    const timestamp = new Date().toISOString();

    setWorkspace((current) =>
      updateActiveWorkspaceNoteSyntaxProfile(
        current,
        syntaxProfileId,
        syntaxVersion,
        timestamp,
      ),
    );
  };

  const moveNoteBlock = (
    request: MoveWorkspaceBlockRequest,
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

    setWorkspace(result.workspace);
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
    createSyntaxFile,
    deleteFolder,
    deleteNote,
    deleteSyntaxFile,
    moveNote,
    moveNoteBlock,
    reloadWorkspace,
    renameFolder,
    repositoryPath,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel,
    syntaxFiles,
    updateActiveNoteSource,
    updateActiveNoteSyntaxProfile,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
  };
}
