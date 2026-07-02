import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";
import type { WorkspaceSyntaxFile } from "../../storage/workspaceRepository";
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
  syntaxFile: WorkspaceSyntaxFile;
  canChangeRepositoryPath: boolean;
  onChangeRepositoryPath: (path: string) => void;
  onCreateFolder: (parentFolderId: FolderId, title: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (folderId: FolderId) => void;
  onDeleteNote: (noteId: NoteId) => void;
  onMoveNote: (noteId: NoteId, targetFolderId: FolderId) => void;
  onReloadWorkspace: () => void;
  onRenameFolder: (folderId: FolderId, title: string) => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
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
  syntaxFile,
  canChangeRepositoryPath,
  onChangeRepositoryPath,
  onCreateFolder,
  onCreateNote,
  onDeleteFolder,
  onDeleteNote,
  onMoveNote,
  onReloadWorkspace,
  onRenameFolder,
  onSelectFolder,
  onSelectNote,
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
        syntaxFile={syntaxFile}
      />
    );
  }

  if (activeActivityId === "migration") {
    return (
      <SidebarMigrationPanel
        notesCount={notes.length}
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
