import type { UiOutlineNode } from "../../projection/viewBlocks.ts";
import type { UiEditorView } from "../../projection/viewEditor.ts";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../projection/viewTree.ts";
import type { WorkspaceDirectoryMutations, WorkspaceSelection } from "../../selection/workspaceSelection.ts";
import type { WorkspaceReferenceNavigationDestination } from "../../../../core/workspace/index.ts";
import type { CtnEditableSourceChange } from "../../../../core/ctn/index.ts";
import type { WorkspaceNoteSourceUpdateResult } from "../../session/sessionCommands.ts";

export type NotesViewModel = {
  activeNote: {
    createdAt: string;
    id: UiNoteId;
    title: string;
    updatedAt: string;
  } | null;
  directory: WorkspaceDirectoryMutations & {
    focusRequest: WorkspaceSelection["directoryFocusRequest"];
    onConsumeFocusRequest: WorkspaceSelection["consumeDirectoryFocusRequest"];
    canMutate: boolean;
    createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
    createNote: (parentFolderId: UiFolderId | null) => void;
    noteTree: UiTreeNode[];
    selectFolder: (folderId: UiFolderId) => void;
    selectNote: (noteId: UiNoteId) => void;
  };
  editor: UiEditorView & {
    onConsumeFocusTarget: (requestId: number) => void;
    onActiveLineChange: (lineNumber: number) => void;
    readOnly: boolean;
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
