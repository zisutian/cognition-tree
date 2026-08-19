import { analyzeCtnSource } from "../../../core/ctn/analysis/sourceAnalysis";
import { initializeCtnSourceBlockMetadata } from "../../../core/ctn/metadata/sourceMetadata";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types";
import { createNoteRecord, type NoteRecord } from "../../../core/workspace/model/workspaceData";
import { createInitialWorkspaceData } from "../../../core/workspace/model/workspaceData";
import { createNoteTreeNoteNode } from "../../../core/workspace/model/noteTree/create";

export const workspaceTestTimestamp = "2026-07-16T00:00:00.000Z";

export function createWorkspaceTestBlockId(value: number) {
  return `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function createCanonicalTestSource(
  editableSource: string,
  {
    idOffset = 0,
    syntax = defaultCtnSyntax,
    timestamp = workspaceTestTimestamp,
  }: {
    idOffset?: number;
    syntax?: CtnCompiledSyntax;
    timestamp?: string;
  } = {},
) {
  let index = idOffset;

  return initializeCtnSourceBlockMetadata(editableSource, syntax, {
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
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source,
    syntax,
  }).editableProjection.source;
}

export function createWorkspaceDataWithNotes(notes: NoteRecord[]) {
  return {
    ...createInitialWorkspaceData(),
    notes,
    tree: notes.map((note) => createNoteTreeNoteNode(note.id)),
  };
}
