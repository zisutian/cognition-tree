import {
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences";
import type { WorkspaceParseIndex } from "../indexes/workspaceParseIndex";
import type { NoteId } from "../model/workspaceData";

export type WorkspaceReferenceNavigationTarget = {
  text: string;
  type: string;
};

export type WorkspaceReferenceNavigationDestination = {
  description: string;
  id: string;
  label: string;
  lineNumber: number;
  noteId: NoteId;
};

export function resolveWorkspaceReferenceNavigation({
  activeNoteId,
  index,
  target,
}: {
  activeNoteId: NoteId;
  index: WorkspaceParseIndex;
  target: WorkspaceReferenceNavigationTarget;
}): WorkspaceReferenceNavigationDestination[] {
  const normalizedTarget = normalizeCtnReferenceText(target.text);

  if (!normalizedTarget) {
    return [];
  }

  if (target.type === ctnGlobalReferenceType) {
    return [...(index.titleIndex.get(normalizedTarget) ?? [])]
      .map((note) => ({
        description: "笔记",
        id: `note:${note.id}`,
        label: note.title,
        lineNumber: 1,
        noteId: note.id,
      }));
  }

  if (target.type !== ctnLocalReferenceType) {
    return [];
  }

  const parsedNote = index.getParsedNote(activeNoteId);

  return parsedNote?.analysis.document.blocks
    .filter(
      (block) => normalizeCtnReferenceText(block.text) === normalizedTarget,
    )
    .map((block) => ({
      description: `L${block.lineNumber} · ${block.rule.label}`,
      id: `block:${activeNoteId}:${block.id}`,
      label: block.text,
      lineNumber: block.lineNumber,
      noteId: activeNoteId,
    })) ?? [];
}
