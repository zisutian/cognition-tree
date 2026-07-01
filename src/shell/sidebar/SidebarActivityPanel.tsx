import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";
import type { SyntaxProfileFile } from "../../storage/workspaceRepository";
import type { CtnSyntaxProfile } from "../../syntax/types";
import type { NoteReferenceGraph } from "../../workspace/noteReferenceGraph";
import {
  sidebarActivityItems,
  sidebarPlaceholderEntries,
  type SidebarActivityId,
} from "./sidebarConfig";
import { SidebarMigrationPanel } from "./SidebarMigrationPanel";
import { SidebarNotesPanel } from "./SidebarNotesPanel";
import { SidebarPlaceholderPanel } from "./SidebarPlaceholderPanel";
import { SidebarSyntaxPanel } from "./SidebarSyntaxPanel";
import { SidebarVisualizationSummary } from "./SidebarVisualizationSummary";

type SidebarActivityPanelProps = {
  activeActivityId: SidebarActivityId;
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  referenceGraph: NoteReferenceGraph;
  repositoryPath: string;
  storageLabel: string;
  selectedSyntaxFileName: string;
  syntaxProfiles: CtnSyntaxProfile[];
  syntaxFiles: SyntaxProfileFile[];
  canChangeRepositoryPath: boolean;
  onChangeRepositoryPath: (path: string) => void;
  onCreateFolder: (parentFolderId: FolderId, title: string) => void;
  onCreateNote: () => void;
  onCreateSyntaxFile: (fileName: string) => void;
  onDeleteSyntaxFile: (fileName: string) => void;
  onDeleteFolder: (folderId: FolderId) => void;
  onDeleteNote: (noteId: NoteId) => void;
  onMoveNote: (noteId: NoteId, targetFolderId: FolderId) => void;
  onReloadWorkspace: () => void;
  onRenameFolder: (folderId: FolderId, title: string) => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
  onSelectSyntaxFile: (fileName: string) => void;
};

export function SidebarActivityPanel({
  activeActivityId,
  activeFolderId,
  activeNoteId,
  notes,
  noteTree,
  referenceGraph,
  repositoryPath,
  storageLabel,
  selectedSyntaxFileName,
  syntaxProfiles,
  syntaxFiles,
  canChangeRepositoryPath,
  onChangeRepositoryPath,
  onCreateFolder,
  onCreateNote,
  onCreateSyntaxFile,
  onDeleteSyntaxFile,
  onDeleteFolder,
  onDeleteNote,
  onMoveNote,
  onReloadWorkspace,
  onRenameFolder,
  onSelectFolder,
  onSelectNote,
  onSelectSyntaxFile,
}: SidebarActivityPanelProps) {
  if (activeActivityId === "notes") {
    return (
      <SidebarNotesPanel
        activeFolderId={activeFolderId}
        activeNoteId={activeNoteId}
        notes={notes}
        noteTree={noteTree}
        repositoryPath={repositoryPath}
        storageLabel={storageLabel}
        canChangeRepositoryPath={canChangeRepositoryPath}
        onChangeRepositoryPath={onChangeRepositoryPath}
        onCreateFolder={onCreateFolder}
        onCreateNote={onCreateNote}
        onDeleteFolder={onDeleteFolder}
        onDeleteNote={onDeleteNote}
        onMoveNote={onMoveNote}
        onReloadWorkspace={onReloadWorkspace}
        onRenameFolder={onRenameFolder}
        onSelectFolder={onSelectFolder}
        onSelectNote={onSelectNote}
      />
    );
  }

  if (activeActivityId === "visualization") {
    return (
      <SidebarVisualizationSummary graph={referenceGraph} />
    );
  }

  if (activeActivityId === "syntax") {
    return (
      <SidebarSyntaxPanel
        selectedFileName={selectedSyntaxFileName}
        syntaxFiles={syntaxFiles}
        onCreateSyntaxFile={onCreateSyntaxFile}
        onDeleteSyntaxFile={onDeleteSyntaxFile}
        onSelectSyntaxFile={onSelectSyntaxFile}
      />
    );
  }

  if (activeActivityId === "migration") {
    return (
      <SidebarMigrationPanel
        notesCount={notes.length}
        syntaxProfilesCount={syntaxProfiles.length}
      />
    );
  }

  return (
    <SidebarPlaceholderPanel
      entries={sidebarPlaceholderEntries[activeActivityId]}
      label={
        sidebarActivityItems.find((item) => item.id === activeActivityId)
          ?.label ??
        "功能"
      }
    />
  );
}
