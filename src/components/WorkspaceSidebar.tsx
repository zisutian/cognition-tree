import type { CtnSyntaxProfile, OutlineNode } from "../ctn/parseOutline";
import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../domain/notes";
import type { SyntaxProfileFile } from "../storage/noteRepository";
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
  selectedSyntaxFileName: string;
  syntaxProfiles: CtnSyntaxProfile[];
  syntaxFiles: SyntaxProfileFile[];
  totalBlocks: number;
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
  onSelectLine: (lineNumber: number) => void;
  onSelectNote: (noteId: NoteId) => void;
  onSelectSyntaxFile: (fileName: string) => void;
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
  selectedSyntaxFileName,
  syntaxProfiles,
  syntaxFiles,
  totalBlocks,
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
  onSelectLine,
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
          diagnosticsCount={diagnosticsCount}
          notes={notes}
          noteTree={noteTree}
          outline={outline}
          repositoryPath={repositoryPath}
          storageLabel={storageLabel}
          selectedSyntaxFileName={selectedSyntaxFileName}
          syntaxProfiles={syntaxProfiles}
          syntaxFiles={syntaxFiles}
          totalBlocks={totalBlocks}
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
          onSelectLine={onSelectLine}
          onSelectNote={onSelectNote}
          onSelectSyntaxFile={onSelectSyntaxFile}
        />
      </section>
    </aside>
  );
}
