import { defaultFolderId } from "../../../workspace/model/workspaceData";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "./viewTree";

export type UiSidebarView = {
  activeFolderId: UiFolderId;
  activeNoteFolderId: UiFolderId | null;
  activeNoteId: UiNoteId | null;
  defaultFolderId: UiFolderId;
  folderCount: number;
  noteTree: UiTreeNode[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
};

export function createUiSidebarView({
  activeFolderId,
  activeNoteFolderId,
  activeNoteId,
  folderCount,
  noteTree,
  repositoryPath,
  saveStatusLabel,
  storageLabel,
}: Omit<UiSidebarView, "defaultFolderId">): UiSidebarView {
  return {
    activeFolderId,
    activeNoteFolderId,
    activeNoteId,
    defaultFolderId,
    folderCount,
    noteTree,
    repositoryPath,
    saveStatusLabel,
    storageLabel,
  };
}
