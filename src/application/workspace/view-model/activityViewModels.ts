import type { UiOutlineNode } from "../projection/viewBlocks";
import type { UiEditorView } from "../projection/viewEditor";
import type { UiVisualizationView } from "../projection/viewGraph";
import type { UiSyntaxView } from "../projection/viewSyntax";
import type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
  UiTreeNode,
} from "../projection/viewTree";
import type { createSyntaxDraftActions } from "./syntaxDraftActions";
import type { StructureOperationViewModel } from "./useStructureOperationViewModel";

export type WorkspaceShellViewModel = {
  errorMessage: string;
  hasConfiguredSyntax: boolean;
  useDefaultSyntax: () => void;
};

export type WorkspaceDirectoryMutations = {
  deleteFolder: (folderId: UiFolderId) => void;
  deleteNote: (noteId: UiNoteId) => void;
  renameFolder: (folderId: UiFolderId, title: string) => void;
  renameNote: (noteId: UiNoteId, title: string) => void;
};

export type NotesViewModel = {
  directory: WorkspaceDirectoryMutations & {
    activeFolderId: UiFolderId | null;
    activeNode: UiDirectoryActiveNode | null;
    createFolder: (parentFolderId: UiFolderId | null, title: string) => void;
    createNote: () => void;
    moveTreeNode: (request: UiTreeMoveRequest) => void;
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

export type StructureOperationActivityViewModel =
  StructureOperationViewModel &
    WorkspaceDirectoryMutations & {
      indentUnitCount: number;
    };

export type SyntaxViewModel = UiSyntaxView &
  ReturnType<typeof createSyntaxDraftActions>;

export type ReferenceGraphMode = "global" | "local";
export type ReferenceGraphLocalDepth = 1 | 2;

export type VisualizationViewModel = UiVisualizationView & {
  filter: {
    hideIsolated: boolean;
    localDepth: ReferenceGraphLocalDepth;
    mode: ReferenceGraphMode;
    query: string;
  };
  onSelectNote: (noteId: UiNoteId) => void;
  setHideIsolated: (hideIsolated: boolean) => void;
  setLocalDepth: (depth: ReferenceGraphLocalDepth) => void;
  setMode: (mode: ReferenceGraphMode) => void;
  setQuery: (query: string) => void;
};

export type SettingsViewModel = {
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  reload: () => Promise<void>;
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
};

export type ViewModel = {
  notes: NotesViewModel;
  settings: SettingsViewModel;
  shell: WorkspaceShellViewModel;
  structureOperation: StructureOperationActivityViewModel;
  syntax: SyntaxViewModel;
  visualization: VisualizationViewModel;
};
