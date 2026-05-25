import type { OutlineNode } from "../../ctn/parseOutline";
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
import { SidebarNotesPanel } from "./SidebarNotesPanel";
import { SidebarOutlineSummary } from "./SidebarOutlineSummary";
import { SidebarPlaceholderPanel } from "./SidebarPlaceholderPanel";

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
  totalBlocks: number;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectLine: (lineNumber: number) => void;
  onSelectNote: (noteId: NoteId) => void;
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
  totalBlocks,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectFolder,
  onSelectLine,
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
        onChangeRepositoryPath={onChangeRepositoryPath}
        onCreateNote={onCreateNote}
        onDeleteNote={onDeleteNote}
        onReloadWorkspace={onReloadWorkspace}
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
