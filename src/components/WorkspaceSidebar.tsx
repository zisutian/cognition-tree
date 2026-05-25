import type { OutlineNode } from "../ctn/parseOutline";
import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../domain/notes";
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
  diagnosticsCount: number;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  outline: OutlineNode[];
  repositoryPath: string;
  storageLabel: string;
  totalBlocks: number;
  onActivityChange: (activityId: SidebarActivityId) => void;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectLine: (lineNumber: number) => void;
  onSelectNote: (noteId: NoteId) => void;
};

export function WorkspaceSidebar({
  activeActivityId,
  activeFolderId,
  activeNoteId,
  diagnosticsCount,
  notes,
  noteTree,
  outline,
  repositoryPath,
  storageLabel,
  totalBlocks,
  onActivityChange,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectFolder,
  onSelectLine,
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
          <p className="eyebrow">Workspace</p>
          <h1>{activeActivityItem.label}</h1>
        </header>
        <SidebarActivityPanel
          activeActivityId={activeActivityId}
          activeFolderId={activeFolderId}
          activeNoteId={activeNoteId}
          diagnosticsCount={diagnosticsCount}
          notes={notes}
          noteTree={noteTree}
          outline={outline}
          repositoryPath={repositoryPath}
          storageLabel={storageLabel}
          totalBlocks={totalBlocks}
          onChangeRepositoryPath={onChangeRepositoryPath}
          onCreateNote={onCreateNote}
          onDeleteNote={onDeleteNote}
          onReloadWorkspace={onReloadWorkspace}
          onSelectFolder={onSelectFolder}
          onSelectLine={onSelectLine}
          onSelectNote={onSelectNote}
        />
      </section>
    </aside>
  );
}
