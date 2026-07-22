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

export const workspaceAnalysisBatchNoteLimit = 25;
export const workspaceAnalysisBatchTimeLimitMs = 8;

type ScheduleAnalysisBatch = (task: () => void) => () => void;

function scheduleAnalysisBatch(task: () => void) {
  const timeoutId = globalThis.setTimeout(task, 0);

  return () => globalThis.clearTimeout(timeoutId);
}

function getCurrentTime() {
  return globalThis.performance?.now() ?? Date.now();
}

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
  now = getCurrentTime,
  onUpdate,
  schedule = scheduleAnalysisBatch,
}: {
  index: WorkspaceParseIndex;
  now?: () => number;
  onUpdate: (analysis: WorkspaceAnalysis) => void;
  schedule?: ScheduleAnalysisBatch;
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

    const startedAt = now();
    let batchNoteCount = 0;

    while (
      cursor < scan.noteIds.length &&
      batchNoteCount < workspaceAnalysisBatchNoteLimit &&
      (batchNoteCount === 0 ||
        now() - startedAt < workspaceAnalysisBatchTimeLimitMs)
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
      cancelScheduledBatch = schedule(runBatch);
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
  cancelScheduledBatch = schedule(runBatch);

  return () => {
    cancelled = true;
    cancelScheduledBatch?.();
    cancelScheduledBatch = null;
  };
}
