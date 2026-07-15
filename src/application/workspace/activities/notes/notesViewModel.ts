import type { UiOutlineNode } from "../../projection/viewBlocks";
import type { UiEditorView } from "../../projection/viewEditor";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../projection/viewTree";
import type { WorkspaceDirectoryMutations } from "../../selection/useWorkspaceSelection";
import type { WorkspaceReferenceNavigationDestination } from "../../../../workspace/queries/workspaceReferenceNavigation";

export type NotesViewModel = {
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
  editor: UiEditorView;
  outline: {
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
  updateSource: (source: string) => void;
};
