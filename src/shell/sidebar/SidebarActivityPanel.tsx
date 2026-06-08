import type { OutlineNode } from "../../ctn/parseOutline";
import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";
import type { SyntaxProfileFile } from "../../storage/workspaceRepository";
import type { CtnSyntaxProfile } from "../../syntax/types";
import {
  sidebarActivityItems,
  sidebarPlaceholderEntries,
  type SidebarActivityId,
} from "./sidebarConfig";
import { SidebarMigrationPanel } from "./SidebarMigrationPanel";
import { SidebarNotesPanel } from "./SidebarNotesPanel";
import { SidebarOutlineSummary } from "./SidebarOutlineSummary";
import { SidebarPlaceholderPanel } from "./SidebarPlaceholderPanel";
import { SidebarSyntaxPanel } from "./SidebarSyntaxPanel";

type SidebarActivityPanelProps = {
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

export function SidebarActivityPanel({
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

  if (activeActivityId === "outline") {
    return (
      <SidebarOutlineSummary
        diagnosticsCount={diagnosticsCount}
        outline={outline}
        totalBlocks={totalBlocks}
        onSelectLine={onSelectLine}
      />
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
