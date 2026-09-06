import type { WorkspaceAnalysis } from "../../analysis/workspaceAnalysis.ts";
import { createUiBlockNodes } from "../../projection/viewBlocks.ts";
import type { UiStructureOperationView } from "../../projection/viewStructureOperation.ts";
import { createUiNoteTree, type UiNoteId } from "../../projection/viewTree.ts";
import type {
  ParsedWorkspaceNote,
  WorkspaceStructureIndex,
  WorkspaceNote,
} from "../../../../core/workspace/index.ts";


import {
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
} from "../../../../core/workspace/index.ts";

type StructureOperationAnalysis = Pick<
  WorkspaceAnalysis,
  "index" | "parsedNotesById"
>;

function resolveParsedNote({
  analysis,
  enabled,
  note,
}: {
  analysis: StructureOperationAnalysis;
  enabled: boolean;
  note: WorkspaceNote | null;
}): ParsedWorkspaceNote | null {
  if (!enabled || !analysis.index || !note) {
    return null;
  }

  return analysis.parsedNotesById.get(note.id) ??
    getParsedWorkspaceNote(analysis.index, note.id);
}

function createNoteSummary(note: WorkspaceNote | null) {
  return note ? { id: note.id, title: note.title } : null;
}

export function createStructureOperationProjection({
  analysis,
  mode,
  notes,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
  workspace,
}: {
  analysis: StructureOperationAnalysis;
  mode: UiStructureOperationView["mode"];
  notes: WorkspaceNote[];
  sourceNoteId: UiNoteId;
  structureNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  workspace: WorkspaceStructureIndex | null;
}): UiStructureOperationView {
  const sourceNote = workspace
    ? findWorkspaceNote(workspace, sourceNoteId)
    : null;
  const targetNote = workspace
    ? findWorkspaceNote(workspace, targetNoteId)
    : null;
  const structureNote = workspace
    ? findWorkspaceNote(workspace, structureNoteId)
    : null;
  const sourceParsed = resolveParsedNote({
    analysis,
    enabled: mode === "betweenNotes",
    note: sourceNote,
  });
  const targetParsed = resolveParsedNote({
    analysis,
    enabled: mode === "betweenNotes",
    note: targetNote,
  });
  const structureParsed = resolveParsedNote({
    analysis,
    enabled: mode === "withinNote",
    note: structureNote,
  });

  return {
    mode,
    noteTree: workspace
      ? createUiNoteTree({ notes, tree: getWorkspaceTree(workspace) })
      : [],
    sourceBlocks: createUiBlockNodes(
      sourceParsed?.analysis.document.blocks ?? [],
    ),
    sourceNote: createNoteSummary(sourceNote),
    sourceNoteId,
    sourceRoots: createUiBlockNodes(
      sourceParsed?.analysis.document.roots ?? [],
    ),
    structureBlocks: createUiBlockNodes(
      structureParsed?.analysis.document.blocks ?? [],
    ),
    structureNote: createNoteSummary(structureNote),
    structureNoteId,
    structureRoots: createUiBlockNodes(
      structureParsed?.analysis.document.roots ?? [],
    ),
    targetNote: createNoteSummary(targetNote),
    targetNoteId,
    targetRoots: createUiBlockNodes(
      targetParsed?.analysis.document.roots ?? [],
    ),
  };
}
