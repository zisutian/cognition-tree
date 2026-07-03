import type { DragEvent } from "react";
import { useState } from "react";
import type { NoteId } from "../../domain/notes";

type NoteSelectionViewProps = {
  notes: Array<{ id: NoteId; title: string }>;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  onSourceNoteChange: (id: NoteId) => void;
  onTargetNoteChange: (id: NoteId) => void;
  onComplete: () => void;
};

export function NoteSelectionView({
  notes,
  sourceNoteId,
  targetNoteId,
  onSourceNoteChange,
  onTargetNoteChange,
  onComplete,
}: NoteSelectionViewProps) {
  const [dragOverNoteId, setDragOverNoteId] = useState<NoteId | null>(null);

  const handleSourceDragStart = (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
    onSourceNoteChange(noteId);
  };

  const handleTargetDragOver = (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => {
    if (noteId === sourceNoteId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverNoteId(noteId);
  };

  const handleTargetDragLeave = () => {
    setDragOverNoteId(null);
  };

  const handleTargetDrop = (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => {
    event.preventDefault();
    setDragOverNoteId(null);

    const droppedSourceId = event.dataTransfer.getData("text/plain");
    if (!droppedSourceId || droppedSourceId === noteId) return;

    onSourceNoteChange(droppedSourceId);
    onTargetNoteChange(noteId);
    onComplete();
  };

  return (
    <div className="migration-note-grid">
      <section className="migration-workspace-column">
        <p className="workspace-detail-title">源笔记（拖拽到目标）</p>
        <ol className="migration-note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                draggable
                className={`migration-note-row ${note.id === sourceNoteId ? "is-source" : ""}`}
                onDragStart={(event) => handleSourceDragStart(event, note.id)}
              >
                {note.title}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="migration-workspace-column">
        <p className="workspace-detail-title">目标笔记（拖放到此处）</p>
        <ol className="migration-note-list">
          {notes
            .filter((note) => note.id !== sourceNoteId)
            .map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`migration-note-row ${note.id === targetNoteId ? "is-target" : ""} ${note.id === dragOverNoteId ? "is-drop-target" : ""}`}
                  onDragOver={(event) => handleTargetDragOver(event, note.id)}
                  onDragLeave={handleTargetDragLeave}
                  onDrop={(event) => handleTargetDrop(event, note.id)}
                >
                  {note.title}
                </button>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}
