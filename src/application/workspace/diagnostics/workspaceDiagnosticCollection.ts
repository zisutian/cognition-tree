import type {
  ParsedWorkspaceNote,
  WorkspaceParseIndex,
} from "../../../workspace/indexes/workspaceParseIndex";
import type { NoteId } from "../../../workspace/model/workspaceData";
import {
  createUiDocumentDiagnostics,
  createUiReferenceDiagnostics,
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
  type UiWorkbenchDiagnostics,
} from "../projection/viewDiagnostics";

export const workspaceDiagnosticBatchNoteLimit = 25;
export const workspaceDiagnosticBatchTimeLimitMs = 8;

type ScheduleDiagnosticBatch = (task: () => void) => () => void;

function scheduleDiagnosticBatch(task: () => void) {
  const timeoutId = globalThis.setTimeout(task, 0);

  return () => globalThis.clearTimeout(timeoutId);
}

function getCurrentTime() {
  return globalThis.performance?.now() ?? Date.now();
}

export function startWorkspaceDiagnosticCollection({
  index,
  now = getCurrentTime,
  onUpdate,
  schedule = scheduleDiagnosticBatch,
}: {
  index: WorkspaceParseIndex;
  now?: () => number;
  onUpdate: (diagnostics: UiWorkbenchDiagnostics) => void;
  schedule?: ScheduleDiagnosticBatch;
}) {
  const scan = index.createScan();
  const documentDiagnostics: UiWorkbenchDiagnostic[] = [];
  const parsedNotesById = new Map<NoteId, ParsedWorkspaceNote>();
  let cancelScheduledBatch: (() => void) | null = null;
  let cancelled = false;
  let cursor = 0;

  const publish = (status: UiWorkbenchDiagnostics["status"]) => {
    onUpdate(createUiWorkbenchDiagnostics([...documentDiagnostics], status));
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
      batchNoteCount < workspaceDiagnosticBatchNoteLimit &&
      (batchNoteCount === 0 ||
        now() - startedAt < workspaceDiagnosticBatchTimeLimitMs)
    ) {
      const noteId = scan.noteIds[cursor];
      cursor += 1;
      batchNoteCount += 1;

      const parsedNote = scan.scanNote(noteId);

      if (parsedNote) {
        parsedNotesById.set(noteId, parsedNote);
        documentDiagnostics.push(...createUiDocumentDiagnostics(parsedNote));
      }
    }

    if (cursor < scan.noteIds.length) {
      publish("collecting");
      cancelScheduledBatch = schedule(runBatch);
      return;
    }

    const referenceDiagnostics = createUiReferenceDiagnostics(
      scan.complete(),
      parsedNotesById,
    );

    onUpdate(
      createUiWorkbenchDiagnostics(
        [...documentDiagnostics, ...referenceDiagnostics],
        "ready",
      ),
    );
  };

  publish("collecting");
  cancelScheduledBatch = schedule(runBatch);

  return () => {
    cancelled = true;
    cancelScheduledBatch?.();
    cancelScheduledBatch = null;
  };
}
