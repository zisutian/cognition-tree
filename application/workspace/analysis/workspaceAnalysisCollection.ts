import type {
  ParsedWorkspaceNote,
  WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import type { NoteId } from "../../../core/workspace/model/workspaceData";
import {
  createUiDocumentDiagnostics,
  createUiReferenceDiagnostics,
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../projection/viewDiagnostics";
import {
  createEmptyNoteReferenceGraph,
  type WorkspaceAnalysis,
} from "./workspaceAnalysis";
import type { ApplicationScheduler } from "../../runtime/applicationScheduler";

export const workspaceAnalysisBatchNoteLimit = 25;
export const workspaceAnalysisBatchTimeLimitMs = 8;

function createAnalysisSnapshot({
  diagnostics,
  index,
  parsedNotesById,
  referenceGraph,
  status,
}: {
  diagnostics: UiWorkbenchDiagnostic[];
  index: WorkspaceParseIndex;
  parsedNotesById: ReadonlyMap<NoteId, ParsedWorkspaceNote>;
  referenceGraph: WorkspaceAnalysis["referenceGraph"];
  status: WorkspaceAnalysis["status"];
}): WorkspaceAnalysis {
  return {
    diagnostics: createUiWorkbenchDiagnostics(diagnostics, status),
    index,
    parsedNotesById,
    referenceGraph,
    status,
    titleIndex: index.titleIndex,
  };
}

export function startWorkspaceAnalysisCollection({
  index,
  onUpdate,
  scheduler,
}: {
  index: WorkspaceParseIndex;
  onUpdate: (analysis: WorkspaceAnalysis) => void;
  scheduler: ApplicationScheduler;
}) {
  const scan = index.createScan();
  const documentDiagnostics: UiWorkbenchDiagnostic[] = [];
  const parsedNotesById = new Map<NoteId, ParsedWorkspaceNote>();
  const emptyGraph = createEmptyNoteReferenceGraph();
  let cancelScheduledBatch: (() => void) | null = null;
  let cancelled = false;
  let cursor = 0;

  const publishCollecting = () => {
    onUpdate(createAnalysisSnapshot({
      diagnostics: [...documentDiagnostics],
      index,
      parsedNotesById: new Map(parsedNotesById),
      referenceGraph: emptyGraph,
      status: "collecting",
    }));
  };
  const runBatch = () => {
    cancelScheduledBatch = null;

    if (cancelled) {
      return;
    }

    const startedAt = scheduler.now();
    let batchNoteCount = 0;

    while (
      cursor < scan.noteIds.length &&
      batchNoteCount < workspaceAnalysisBatchNoteLimit &&
      (batchNoteCount === 0 ||
        scheduler.now() - startedAt < workspaceAnalysisBatchTimeLimitMs)
    ) {
      const noteId = scan.noteIds[cursor];
      cursor += 1;
      batchNoteCount += 1;

      const parsedNote = scan.scanNote(noteId);

      if (!parsedNote) {
        throw new Error(`Workspace analysis note disappeared: ${noteId}`);
      }

      parsedNotesById.set(noteId, parsedNote);
      documentDiagnostics.push(...createUiDocumentDiagnostics(parsedNote));
    }

    if (cursor < scan.noteIds.length) {
      publishCollecting();
      cancelScheduledBatch = scheduler.schedule(runBatch, 0);
      return;
    }

    const referenceGraph = scan.complete();
    const referenceDiagnostics = createUiReferenceDiagnostics(
      referenceGraph,
      parsedNotesById,
    );

    onUpdate(createAnalysisSnapshot({
      diagnostics: [...documentDiagnostics, ...referenceDiagnostics],
      index,
      parsedNotesById: new Map(parsedNotesById),
      referenceGraph,
      status: "ready",
    }));
  };

  publishCollecting();
  cancelScheduledBatch = scheduler.schedule(runBatch, 0);

  return () => {
    cancelled = true;
    cancelScheduledBatch?.();
    cancelScheduledBatch = null;
  };
}
