import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "./viewTree";

export type UiSidebarView = {
  activeFolderId: UiFolderId | null;
  activeNoteFolderId: UiFolderId | null;
  activeNoteId: UiNoteId | null;
  noteTree: UiTreeNode[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
};

export function createUiSidebarView({
  activeFolderId,
  activeNoteFolderId,
  activeNoteId,
  noteTree,
  repositoryPath,
  saveStatusLabel,
  storageLabel,
}: UiSidebarView): UiSidebarView {
  return {
    activeFolderId,
    activeNoteFolderId,
    activeNoteId,
    noteTree,
    repositoryPath,
    saveStatusLabel,
    storageLabel,
  };
}
