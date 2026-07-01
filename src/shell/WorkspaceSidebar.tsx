import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../domain/notes";
import type { SyntaxProfileFile } from "../storage/workspaceRepository";
import type { CtnSyntaxProfile } from "../syntax/types";
import type { NoteReferenceGraph } from "../workspace/noteReferenceGraph";
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
  referenceGraph: NoteReferenceGraph;
  repositoryPath: string;
  storageLabel: string;
  selectedSyntaxFileName: string;
  syntaxProfiles: CtnSyntaxProfile[];
  syntaxFiles: SyntaxProfileFile[];
  canChangeRepositoryPath: boolean;
  onActivityChange: (activityId: SidebarActivityId) => void;
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

export function WorkspaceSidebar({
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
  onActivityChange,
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
          notes={notes}
          noteTree={noteTree}
          referenceGraph={referenceGraph}
          repositoryPath={repositoryPath}
          storageLabel={storageLabel}
          selectedSyntaxFileName={selectedSyntaxFileName}
          syntaxProfiles={syntaxProfiles}
          syntaxFiles={syntaxFiles}
          canChangeRepositoryPath={canChangeRepositoryPath}
          onChangeRepositoryPath={onChangeRepositoryPath}
          onCreateFolder={onCreateFolder}
          onCreateNote={onCreateNote}
          onCreateSyntaxFile={onCreateSyntaxFile}
          onDeleteSyntaxFile={onDeleteSyntaxFile}
          onDeleteFolder={onDeleteFolder}
          onDeleteNote={onDeleteNote}
          onMoveNote={onMoveNote}
          onReloadWorkspace={onReloadWorkspace}
          onRenameFolder={onRenameFolder}
          onSelectFolder={onSelectFolder}
          onSelectNote={onSelectNote}
          onSelectSyntaxFile={onSelectSyntaxFile}
        />
      </section>
    </aside>
  );
}
