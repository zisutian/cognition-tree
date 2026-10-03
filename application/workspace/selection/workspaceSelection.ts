// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
} from "../projection/viewTree.ts";

export type WorkspaceDirectoryMutations = {
  deleteFolder: (folderId: UiFolderId) => void;
  deleteNote: (noteId: UiNoteId) => void;
  moveTreeNodes: (request: UiTreeMoveRequest) => void;
  renameFolder: (folderId: UiFolderId, title: string) => void;
  renameNote: (noteId: UiNoteId, title: string) => void;
};

export type WorkspaceSelection = WorkspaceDirectoryMutations & {
  activeNoteId: UiNoteId | null;
  directoryFocusRequest: { requestId: number; node: UiDirectoryActiveNode } | null;
  consumeDirectoryFocusRequest: (requestId: number) => void;
  requestDirectoryFocus: (node: UiDirectoryActiveNode) => void;
  createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
  createNote: (parentFolderId: UiFolderId | null) => void;
  selectFolder: (folderId: UiFolderId) => void;
  selectNote: (noteId: UiNoteId) => void;
};
