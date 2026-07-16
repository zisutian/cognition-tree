import { createCtnEditableSource } from "../../src/ctn/metadata/editableSource";
import { initializeCtnSourceBlockMetadata } from "../../src/ctn/metadata/sourceMetadata";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/ctn/syntax/types";
import { createNoteRecord, type NoteRecord } from "../../src/workspace/model/workspaceData";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import { createNoteTreeNoteNode } from "../../src/workspace/model/noteTree/create";

export const workspaceTestTimestamp = "2026-07-16T00:00:00.000Z";

export function createWorkspaceTestBlockId(value: number) {
  return `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function createCanonicalTestSource(
  editableSource: string,
  {
    idOffset = 0,
    syntaxProfile = defaultCtnSyntaxProfile,
    timestamp = workspaceTestTimestamp,
  }: {
    idOffset?: number;
    syntaxProfile?: CtnSyntaxProfile;
    timestamp?: string;
  } = {},
) {
  let index = idOffset;

  return initializeCtnSourceBlockMetadata(editableSource, syntaxProfile, {
    createdAt: timestamp,
    createId: () => createWorkspaceTestBlockId(++index),
    reservedIds: new Set(),
    updatedAt: timestamp,
  });
}

export function createCanonicalTestNote(
  id: string,
  editableSource: string,
  options?: Parameters<typeof createCanonicalTestSource>[1],
): NoteRecord {
  return createNoteRecord(id, createCanonicalTestSource(editableSource, options));
}

export function readEditableTestSource(
  source: string,
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
) {
  return createCtnEditableSource(source, syntaxProfile).source;
}

export function createWorkspaceDataWithNotes(notes: NoteRecord[]) {
  return {
    ...createInitialWorkspaceData(),
    notes,
    tree: notes.map((note) => createNoteTreeNoteNode(note.id)),
  };
}
