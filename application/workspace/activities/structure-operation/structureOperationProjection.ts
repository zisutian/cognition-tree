import type { WorkspaceAnalysis } from "../../analysis/workspaceAnalysis";
import { createUiBlockNodes } from "../../projection/viewBlocks";
import type { UiStructureOperationView } from "../../projection/viewStructureOperation";
import { createUiNoteTree, type UiNoteId } from "../../projection/viewTree";
import type { ParsedWorkspaceNote } from "../../../../core/workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import type { WorkspaceNote } from "../../../../core/workspace/model/workspaceData";
import {
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
} from "../../../../core/workspace/queries/workspaceQueries";

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
    sourceBlocks: createUiBlockNodes(sourceParsed?.document.blocks ?? []),
    sourceNote: createNoteSummary(sourceNote),
    sourceNoteId,
    sourceRoots: createUiBlockNodes(sourceParsed?.document.roots ?? []),
    structureBlocks: createUiBlockNodes(
      structureParsed?.document.blocks ?? [],
    ),
    structureNote: createNoteSummary(structureNote),
    structureNoteId,
    structureRoots: createUiBlockNodes(
      structureParsed?.document.roots ?? [],
    ),
    targetNote: createNoteSummary(targetNote),
    targetNoteId,
    targetRoots: createUiBlockNodes(targetParsed?.document.roots ?? []),
  };
}
