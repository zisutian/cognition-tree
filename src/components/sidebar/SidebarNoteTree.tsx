import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Trash2,
} from "lucide-react";
import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
} from "../../domain/notes";

type SidebarNoteTreeProps = {
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  collapsedFolderIds: Set<FolderId>;
  nodes: NoteTreeNode[];
  notesById: Map<NoteId, NoteRecord>;
  onDeleteNote: (noteId: NoteId) => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
  onToggleFolder: (folderId: FolderId) => void;
};

export function SidebarNoteTree({
  activeFolderId,
  activeNoteId,
  collapsedFolderIds,
  nodes,
  notesById,
  onDeleteNote,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
}: SidebarNoteTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.id);
          const hasChildren = node.children.length > 0;

          return (
            <div className="note-folder" key={node.id}>
              <div
                className={
                  node.id === activeFolderId
                    ? "note-folder-row active"
                    : "note-folder-row"
                }
              >
                <button
                  aria-label={
                    isCollapsed ? `展开 ${node.title}` : `折叠 ${node.title}`
                  }
                  className="note-folder-toggle"
                  disabled={!hasChildren}
                  onClick={() => onToggleFolder(node.id)}
                  title={isCollapsed ? "展开文件夹" : "折叠文件夹"}
                  type="button"
                >
                  {hasChildren ? (
                    isCollapsed ? (
                      <ChevronRight
                        aria-hidden="true"
                        size={13}
                        strokeWidth={2}
                      />
                    ) : (
                      <ChevronDown
                        aria-hidden="true"
                        size={13}
                        strokeWidth={2}
                      />
                    )
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
                <button
                  className="note-folder-label"
                  onClick={() => onSelectFolder(node.id)}
                  title={node.title}
                  type="button"
                >
                  <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span>{node.title}</span>
                  <small>{node.children.length}</small>
                </button>
              </div>
              {!isCollapsed ? (
                <div className="note-folder-children">
                  {hasChildren ? (
                    <SidebarNoteTree
                      activeFolderId={activeFolderId}
                      activeNoteId={activeNoteId}
                      collapsedFolderIds={collapsedFolderIds}
                      nodes={node.children}
                      notesById={notesById}
                      onDeleteNote={onDeleteNote}
                      onSelectFolder={onSelectFolder}
                      onSelectNote={onSelectNote}
                      onToggleFolder={onToggleFolder}
                    />
                  ) : (
                    <p className="side-muted">空</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        }

        const note = notesById.get(node.noteId);

        if (!note) {
          return null;
        }

        const deleteNote = () => {
          if (window.confirm(`删除笔记「${note.title}」？`)) {
            onDeleteNote(note.id);
          }
        };

        return (
          <div className="note-item-row" key={node.id}>
            <button
              className={
                note.id === activeNoteId ? "note-item active" : "note-item"
              }
              onClick={() => onSelectNote(note.id)}
              title={note.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>{note.title}</span>
            </button>
            <button
              aria-label={`删除 ${note.title}`}
              className="note-delete-button"
              onClick={deleteNote}
              title="删除笔记"
              type="button"
            >
              <Trash2 aria-hidden="true" size={13} strokeWidth={1.9} />
            </button>
          </div>
        );
      })}
    </>
  );
}
