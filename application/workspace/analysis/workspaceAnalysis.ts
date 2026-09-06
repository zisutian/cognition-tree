import type {
  NoteReferenceGraph,
  ParsedWorkspaceNote,
  WorkspaceParseIndex,
  NoteId,
  WorkspaceNote,
} from "../../../core/workspace/index.ts";

import type { UiWorkbenchDiagnostics } from "../projection/viewDiagnostics.ts";

export type WorkspaceAnalysisStatus = "collecting" | "ready";

export type WorkspaceAnalysis = {
  diagnostics: UiWorkbenchDiagnostics;
  index: WorkspaceParseIndex | null;
  parsedNotesById: ReadonlyMap<NoteId, ParsedWorkspaceNote>;
  referenceGraph: NoteReferenceGraph;
  status: WorkspaceAnalysisStatus;
  titleIndex: ReadonlyMap<string, readonly WorkspaceNote[]>;
};

export function createEmptyNoteReferenceGraph(): NoteReferenceGraph {
  return {
    ambiguousReferences: [],
    edges: [],
    nodes: [],
    unresolvedReferences: [],
  };
}
