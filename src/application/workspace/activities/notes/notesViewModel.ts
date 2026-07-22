import type { UiOutlineNode } from "../../projection/viewBlocks";
import type { UiEditorView } from "../../projection/viewEditor";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../projection/viewTree";
import type { WorkspaceDirectoryMutations } from "../../selection/useWorkspaceSelection";
import type { WorkspaceReferenceNavigationDestination } from "../../../../../core/workspace/queries/workspaceReferenceNavigation";
import type { CtnEditableSourceChange } from "../../../../../core/ctn/metadata/textEdits";
import type { WorkspaceNoteSourceUpdateResult } from "../../session/sessionCommands";

export type NotesViewModel = {
  activeNote: {
    createdAt: string;
    id: UiNoteId;
    title: string;
    updatedAt: string;
  } | null;
  directory: WorkspaceDirectoryMutations & {
    activeFolderId: UiFolderId | null;
    activeNode: UiDirectoryActiveNode | null;
    clearFolderSelection: () => void;
    createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
    createNote: () => void;
    noteTree: UiTreeNode[];
    selectFolder: (folderId: UiFolderId) => void;
    selectNote: (noteId: UiNoteId) => void;
  };
  editor: UiEditorView & {
    onConsumeFocusTarget: (requestId: number) => void;
    onActiveLineChange: (lineNumber: number) => void;
  };
  outline: {
    activeBlock: UiOutlineNode | null;
    nodes: UiOutlineNode[];
    onSelectLine: (lineNumber: number) => void;
  };
  referenceNavigation: {
    navigate: (destination: WorkspaceReferenceNavigationDestination) => void;
    resolve: (target: {
      text: string;
      type: string;
    }) => WorkspaceReferenceNavigationDestination[];
  };
  updateSource: (
    change: CtnEditableSourceChange,
  ) => WorkspaceNoteSourceUpdateResult;
};
