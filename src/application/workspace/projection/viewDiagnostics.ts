import {
  createCtnEditableSource,
  getCtnEditableLineNumber,
} from "../../../ctn/metadata/editableSource";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../../ctn/syntax/profileDraft";
import type {
  NoteReferenceGraph,
  ParsedWorkspaceNote,
} from "../../../workspace/indexes/workspaceParseIndex";
import type { NoteId } from "../../../workspace/model/workspaceData";
import {
  resolveUiSyntaxDiagnosticLocation,
  type UiSyntaxFieldId,
} from "./viewSyntaxFields";

export type UiWorkbenchDiagnosticSource = "document" | "reference" | "syntax";
export type UiWorkbenchDiagnosticSeverity = "error" | "warning";

export type UiWorkbenchDiagnosticTarget =
  | {
      kind: "note-line";
      lineNumber: number;
      noteId: NoteId;
    }
  | {
      fieldId: UiSyntaxFieldId;
      kind: "syntax-field";
      path: string;
    };

export type UiWorkbenchDiagnostic = {
  code: string;
  id: string;
  locationLabel: string;
  message: string;
  severity: UiWorkbenchDiagnosticSeverity;
  source: UiWorkbenchDiagnosticSource;
  target: UiWorkbenchDiagnosticTarget;
};

export type UiWorkbenchDiagnostics = {
  diagnostics: UiWorkbenchDiagnostic[];
  errorCount: number;
  status: "collecting" | "ready";
  warningCount: number;
};

function createEditableLineProjector(parsedNote: ParsedWorkspaceNote) {
  const editableSource = createCtnEditableSource(
    parsedNote.source,
    parsedNote.profile,
  );

  return (lineNumber: number) =>
    getCtnEditableLineNumber(editableSource, lineNumber);
}

export function createUiDocumentDiagnostics(
  parsedNote: ParsedWorkspaceNote,
): UiWorkbenchDiagnostic[] {
  if (!parsedNote.note) {
    return [];
  }

  const note = parsedNote.note;
  const projectLineNumber = createEditableLineProjector(parsedNote);

  return parsedNote.document.diagnostics.map((diagnostic) => {
    const lineNumber = projectLineNumber(diagnostic.lineNumber);

    return {
      code: diagnostic.code,
      id: `document:${note.id}:${diagnostic.id}`,
      locationLabel: `${note.title} · L${lineNumber}:C${diagnostic.column}`,
      message: diagnostic.message,
      severity: diagnostic.severity,
      source: "document",
      target: {
        kind: "note-line",
        lineNumber,
        noteId: note.id,
      },
    };
  });
}

export function createUiReferenceDiagnostics(
  graph: NoteReferenceGraph,
  parsedNotesById: ReadonlyMap<NoteId, ParsedWorkspaceNote>,
): UiWorkbenchDiagnostic[] {
  const lineProjectorByNoteId = new Map<NoteId, (lineNumber: number) => number>();

  return graph.unresolvedReferences.map((reference) => {
    const parsedNote = parsedNotesById.get(reference.sourceNoteId);
    let projectLineNumber = lineProjectorByNoteId.get(reference.sourceNoteId);

    if (!projectLineNumber && parsedNote) {
      projectLineNumber = createEditableLineProjector(parsedNote);
      lineProjectorByNoteId.set(reference.sourceNoteId, projectLineNumber);
    }

    const lineNumber = projectLineNumber
      ? projectLineNumber(reference.lineNumber)
      : reference.lineNumber;
    const sourceTitle = parsedNote?.note?.title ?? reference.sourceNoteId;
    const occurrenceLabel = reference.count > 1 ? `（${reference.count} 处）` : "";

    return {
      code: "unresolved-global-reference",
      id: `reference:${reference.sourceNoteId}:${reference.targetText}`,
      locationLabel: `${sourceTitle} · L${lineNumber}`,
      message: `无法解析全局引用“${reference.targetText}”${occurrenceLabel}。`,
      severity: "warning",
      source: "reference",
      target: {
        kind: "note-line",
        lineNumber,
        noteId: reference.sourceNoteId,
      },
    };
  });
}

export function createUiSyntaxDiagnostics(
  draft: SyntaxProfileDraft,
  draftResult: SyntaxProfileDraftBuildResult,
): UiWorkbenchDiagnostic[] {
  return draftResult.diagnostics.map((diagnostic) => {
    const location = resolveUiSyntaxDiagnosticLocation(draft, diagnostic.path);

    return {
      code: diagnostic.code,
      id: `syntax:${diagnostic.code}:${diagnostic.path}`,
      locationLabel: `仓库语法 · ${location.label}`,
      message: diagnostic.message,
      severity: "error",
      source: "syntax",
      target: {
        fieldId: location.fieldId,
        kind: "syntax-field",
        path: diagnostic.path,
      },
    };
  });
}

function compareDiagnostics(
  left: UiWorkbenchDiagnostic,
  right: UiWorkbenchDiagnostic,
) {
  if (left.severity !== right.severity) {
    return left.severity === "error" ? -1 : 1;
  }

  const locationOrder = left.locationLabel.localeCompare(
    right.locationLabel,
    "zh-CN",
    { numeric: true },
  );

  return locationOrder || left.id.localeCompare(right.id, "zh-CN", {
    numeric: true,
  });
}

export function createUiWorkbenchDiagnostics(
  diagnostics: UiWorkbenchDiagnostic[],
  status: UiWorkbenchDiagnostics["status"],
): UiWorkbenchDiagnostics {
  const uniqueDiagnostics = [...new Map(
    diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]),
  ).values()].sort(compareDiagnostics);

  return {
    diagnostics: uniqueDiagnostics,
    errorCount: uniqueDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length,
    status,
    warningCount: uniqueDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    ).length,
  };
}
