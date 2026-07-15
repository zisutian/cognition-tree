import type { UiOutlineNode } from "../../projection/viewBlocks";
import type { UiEditorView } from "../../projection/viewEditor";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../projection/viewTree";
import type { WorkspaceDirectoryMutations } from "../../selection/useWorkspaceSelection";

export type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

export type NotesViewModel = {
  directory: WorkspaceDirectoryMutations & {
    activeFolderId: UiFolderId | null;
    activeNode: UiDirectoryActiveNode | null;
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
  updateSource: (source: string) => void;
};
