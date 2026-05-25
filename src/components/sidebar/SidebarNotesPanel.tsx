import { Plus, RefreshCw } from "lucide-react";
import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";
import { SidebarNoteTree } from "./SidebarNoteTree";

type SidebarNotesPanelProps = {
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  repositoryPath: string;
  storageLabel: string;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
};

export function SidebarNotesPanel({
  activeFolderId,
  activeNoteId,
  notes,
  noteTree,
  repositoryPath,
  storageLabel,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectFolder,
  onSelectNote,
}: SidebarNotesPanelProps) {
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const requestRepositoryPath = () => {
    const nextPath = window.prompt("仓库文件夹路径", repositoryPath);

    if (nextPath) {
      onChangeRepositoryPath(nextPath);
    }
  };

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-section-header">
          <p className="side-section-title">笔记</p>
          <button
            className="side-action-button"
            onClick={onCreateNote}
            type="button"
          >
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            新建
          </button>
        </div>
        <nav className="note-tree" aria-label="笔记仓库">
          <SidebarNoteTree
            activeFolderId={activeFolderId}
            activeNoteId={activeNoteId}
            nodes={noteTree}
            notesById={notesById}
            onDeleteNote={onDeleteNote}
            onSelectFolder={onSelectFolder}
            onSelectNote={onSelectNote}
          />
        </nav>
      </section>

      <section className="side-section">
        <div className="side-section-header">
          <p className="side-section-title">存储</p>
          <div className="side-action-group">
            <button
              className="side-action-button"
              onClick={onReloadWorkspace}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={13} strokeWidth={2} />
              刷新
            </button>
            <button
              className="side-action-button"
              onClick={requestRepositoryPath}
              type="button"
            >
              更改
            </button>
          </div>
        </div>
        <div className="side-placeholder">
          <span>{storageLabel}</span>
          <strong>自动保存</strong>
          <code className="side-path">{repositoryPath || "加载中"}</code>
        </div>
      </section>
    </div>
  );
}
