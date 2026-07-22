// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
} from "../projection/viewTree";

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
