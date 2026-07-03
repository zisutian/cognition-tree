import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../workspace/model/workspaceData";
import { SidebarActivityBar } from "./sidebar/SidebarActivityBar";
import { SidebarActivityPanel } from "./sidebar/SidebarActivityPanel";
import {
  sidebarActivityItems,
  type SidebarActivityId,
} from "./sidebar/sidebarConfig";

export type { SidebarActivityId } from "./sidebar/sidebarConfig";

type WorkspaceSidebarProps = {
  activeActivityId: SidebarActivityId;
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
  canChangeRepositoryPath: boolean;
  onActivityChange: (activityId: SidebarActivityId) => void;
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

export function WorkspaceSidebar({
  activeActivityId,
  activeFolderId,
  activeNoteId,
  notes,
  noteTree,
  repositoryPath,
  saveStatusLabel,
  storageLabel,
  canChangeRepositoryPath,
  onActivityChange,
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
}: WorkspaceSidebarProps) {
  const activeActivityItem =
    sidebarActivityItems.find((item) => item.id === activeActivityId) ??
    sidebarActivityItems[0];

  return (
    <aside className="workspace-sidebar">
      <SidebarActivityBar
        activeActivityId={activeActivityId}
        onActivityChange={onActivityChange}
      />

      <section className="side-panel" aria-label={activeActivityItem.label}>
        <header className="side-panel-header">
          <h1>{activeActivityItem.label}</h1>
        </header>
        <SidebarActivityPanel
          activeActivityId={activeActivityId}
          activeFolderId={activeFolderId}
          activeNoteId={activeNoteId}
          notes={notes}
          noteTree={noteTree}
          repositoryPath={repositoryPath}
          saveStatusLabel={saveStatusLabel}
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
      </section>
    </aside>
  );
}
