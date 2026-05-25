import { FileText, Folder, Trash2 } from "lucide-react";
import type { NoteId, NoteRecord, NoteTreeNode } from "../../domain/notes";

type SidebarNoteTreeProps = {
  activeNoteId: NoteId | null;
  nodes: NoteTreeNode[];
  notesById: Map<NoteId, NoteRecord>;
  onDeleteNote: (noteId: NoteId) => void;
  onSelectNote: (noteId: NoteId) => void;
};

export function SidebarNoteTree({
  activeNoteId,
  nodes,
  notesById,
  onDeleteNote,
  onSelectNote,
}: SidebarNoteTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          return (
            <div className="note-folder" key={node.id}>
              <div className="note-folder-label">
                <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                <span>{node.title}</span>
                <small>{node.children.length}</small>
              </div>
              <div className="note-folder-children">
                {node.children.length > 0 ? (
                  <SidebarNoteTree
                    activeNoteId={activeNoteId}
                    nodes={node.children}
                    notesById={notesById}
                    onDeleteNote={onDeleteNote}
                    onSelectNote={onSelectNote}
                  />
                ) : (
                  <p className="side-muted">空</p>
                )}
              </div>
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
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>{note.title}</span>
              <small>{note.source.split("\n").length} 行</small>
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
