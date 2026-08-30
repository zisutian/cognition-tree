import type {
  NoteReferenceGraph,
  ParsedWorkspaceNote,
  WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import type {
  NoteId,
  WorkspaceNote,
} from "../../../core/workspace/model/workspaceData";
import type { UiWorkbenchDiagnostics } from "../projection/viewDiagnostics";

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
