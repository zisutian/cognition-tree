type NoteLike = {
  id: string;
};

export function resolveActiveNoteId(
  notes: NoteLike[],
  currentNoteId: string | null,
) {
  return currentNoteId && notes.some((note) => note.id === currentNoteId)
    ? currentNoteId
    : (notes[0]?.id ?? null);
}

export function resolveActiveNoteIdAfterRemovingNote(
  notes: NoteLike[],
  currentNoteId: string | null,
  removedNoteId: string,
) {
  return currentNoteId === removedNoteId
    ? (notes.find((note) => note.id !== removedNoteId)?.id ?? null)
    : currentNoteId;
}

export function resolveActiveNoteIdAfterRemovingNotes(
  notes: NoteLike[],
  currentNoteId: string | null,
  removedNoteIds: Set<string>,
) {
  return currentNoteId && removedNoteIds.has(currentNoteId)
    ? (notes.find((note) => !removedNoteIds.has(note.id))?.id ?? null)
    : currentNoteId;
}

export function resolveDifferentNoteId(
  notes: NoteLike[],
  noteId: string,
) {
  return notes.find((note) => note.id !== noteId)?.id ?? "";
}
