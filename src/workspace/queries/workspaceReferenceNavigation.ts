import {
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences";
import type { WorkspaceParseIndex } from "../indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
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
  workspace,
}: {
  activeNoteId: NoteId;
  index: WorkspaceParseIndex;
  target: WorkspaceReferenceNavigationTarget;
  workspace: WorkspaceStructureIndex;
}): WorkspaceReferenceNavigationDestination[] {
  const normalizedTarget = normalizeCtnReferenceText(target.text);

  if (!normalizedTarget) {
    return [];
  }

  if (target.type === ctnGlobalReferenceType) {
    return workspace.data.notes
      .filter(
        (note) =>
          normalizeCtnReferenceText(note.title) === normalizedTarget,
      )
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

  return parsedNote?.document.blocks
    .filter(
      (block) => normalizeCtnReferenceText(block.text) === normalizedTarget,
    )
    .map((block) => ({
      description: `L${block.lineNumber} · ${block.label}`,
      id: `block:${activeNoteId}:${block.id}`,
      label: block.text,
      lineNumber: block.lineNumber,
      noteId: activeNoteId,
    })) ?? [];
}
