import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";
import {
  sidebarActivityItems,
  sidebarPlaceholderEntries,
  type SidebarActivityId,
} from "./sidebarConfig";
import { SidebarMigrationPanel } from "./SidebarMigrationPanel";
import { SidebarNotesPanel } from "./SidebarNotesPanel";
import { SidebarPlaceholderPanel } from "./SidebarPlaceholderPanel";
import { SidebarSettingsPanel } from "./SidebarSettingsPanel";

type SidebarActivityPanelProps = {
  activeActivityId: SidebarActivityId;
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
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
  repositoryPath,
  saveStatusLabel,
  storageLabel,
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
        onCreateFolder={onCreateFolder}
        onCreateNote={onCreateNote}
        onDeleteFolder={onDeleteFolder}
        onDeleteNote={onDeleteNote}
        onMoveNote={onMoveNote}
        onRenameFolder={onRenameFolder}
        onSelectFolder={onSelectFolder}
        onSelectNote={onSelectNote}
      />
    );
  }

  if (activeActivityId === "visualization") {
    return null;
  }

  if (activeActivityId === "syntax") {
    return null;
  }

  if (activeActivityId === "migration") {
    return <SidebarMigrationPanel />;
  }

  if (activeActivityId === "settings") {
    return (
      <SidebarSettingsPanel
        canChangeRepositoryPath={canChangeRepositoryPath}
        repositoryPath={repositoryPath}
        saveStatusLabel={saveStatusLabel}
        storageLabel={storageLabel}
        onChangeRepositoryPath={onChangeRepositoryPath}
        onReloadWorkspace={onReloadWorkspace}
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
