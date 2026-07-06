import type { MoveWorkspaceBlockFailureReason } from "../../workspace/commands/blockMigrationCommands";

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

const moveBlockFailureMessages: Record<MoveWorkspaceBlockFailureReason, string> = {
  "missing-note": "源笔记或目标笔记不存在。",
  "parsed-note-missing": "笔记解析结果不存在。",
  "same-note-unsupported": "第一版不支持同一笔记内移动块。",
  "source-block-missing": "源块不存在。",
  "target-position-missing": "目标插入位置不存在。",
};

export function getMoveBlockFailureMessage(
  reason: MoveWorkspaceBlockFailureReason,
) {
  return moveBlockFailureMessages[reason];
}

export function getMoveBlockSuccessMessage() {
  return "块迁移完成。";
}
