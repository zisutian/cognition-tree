import {
  getCtnEditableLineNumber,
} from "../../../core/ctn/metadata/editableSource";
import type {
  CtnSyntaxDraft,
  CtnSyntaxDraftBuildResult,
} from "../../../core/ctn/syntax/draft";
import type {
  NoteReferenceGraph,
  ParsedWorkspaceNote,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import type { NoteId } from "../../../core/workspace/model/workspaceData";
import { collectWorkspacePortableNameIssues } from "../../../core/workspace/queries/workspacePortableNameIssues";
import {
  resolveSyntaxDiagnosticLocation,
  syntaxFieldIds,
  type SyntaxFieldId,
} from "../../syntax/syntaxProjection";

export type UiWorkbenchDiagnosticSource =
  | "document"
  | "name"
  | "reference"
  | "syntax";
export type UiWorkbenchDiagnosticSeverity = "error" | "warning";

export type UiWorkbenchDiagnosticTarget =
  | {
      kind: "note-line";
      lineNumber: number;
      noteId: NoteId;
    }
  | {
      fieldId: SyntaxFieldId;
      kind: "syntax-field";
      path: string;
      syntaxFileId: string;
    }
  | {
      fieldId: SyntaxFieldId;
      kind: "system-syntax";
      owner: "journal" | "todo";
      path: string;
    }
  | {
      entity: "folder";
      folderId: string;
      kind: "portable-name";
      owner: "workspace";
    }
  | {
      entity: "note";
      kind: "portable-name";
      noteId: NoteId;
      owner: "workspace";
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
  const editableSource = parsedNote.analysis.editableProjection;

  return (lineNumber: number) =>
    getCtnEditableLineNumber(editableSource, lineNumber);
}

export function createUiDocumentDiagnostics(
  parsedNote: ParsedWorkspaceNote,
): UiWorkbenchDiagnostic[] {
  const note = parsedNote.note;
  const projectLineNumber = createEditableLineProjector(parsedNote);

  return parsedNote.analysis.document.diagnostics.map((diagnostic) => {
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
  const createDiagnostic = (
    reference: (typeof graph.unresolvedReferences)[number],
    kind: "ambiguous" | "unresolved",
    candidateCount = 0,
  ): UiWorkbenchDiagnostic => {
    const parsedNote = parsedNotesById.get(reference.sourceNoteId);
    let projectLineNumber = lineProjectorByNoteId.get(reference.sourceNoteId);

    if (!projectLineNumber && parsedNote) {
      projectLineNumber = createEditableLineProjector(parsedNote);
      lineProjectorByNoteId.set(reference.sourceNoteId, projectLineNumber);
    }

    const lineNumber = projectLineNumber
      ? projectLineNumber(reference.lineNumber)
      : reference.lineNumber;
    const sourceTitle = parsedNote?.note.title ?? reference.sourceNoteId;
    const occurrenceLabel = reference.count > 1 ? `（${reference.count} 处）` : "";
    const ambiguousLabel = `全局引用“${reference.targetText}”匹配 ${candidateCount} 篇同名笔记${occurrenceLabel}，请选择具体目标。`;
    const unresolvedLabel = `无法解析全局引用“${reference.targetText}”${occurrenceLabel}。`;

    return {
      code: `${kind}-global-reference`,
      id: `reference:${kind}:${reference.sourceNoteId}:${reference.targetText}`,
      locationLabel: `${sourceTitle} · L${lineNumber}`,
      message: kind === "ambiguous" ? ambiguousLabel : unresolvedLabel,
      severity: "warning",
      source: "reference",
      target: {
        kind: "note-line",
        lineNumber,
        noteId: reference.sourceNoteId,
      },
    };
  };

  return [
    ...graph.unresolvedReferences.map((reference) =>
      createDiagnostic(reference, "unresolved"),
    ),
    ...graph.ambiguousReferences.map((reference) =>
      createDiagnostic(reference, "ambiguous", reference.candidateNoteIds.length),
    ),
  ];
}

export function createUiWorkspacePortableNameDiagnostics(
  workspace: WorkspaceStructureIndex,
): UiWorkbenchDiagnostic[] {
  return collectWorkspacePortableNameIssues(workspace).map((item) => {
    const entityLabel = item.kind === "note" ? "笔记" : "文件夹";
    const message = item.issue === "noncanonical"
      ? `${entityLabel}名称需要规范化，请手工重命名。`
      : item.issue === "empty"
        ? `${entityLabel}名称不能为空，请手工重命名。`
        : `${entityLabel}名称包含不可移植字符，请手工重命名。`;

    return {
      code: `nonportable-workspace-${item.kind}-name`,
      id: `portable-name:workspace:${item.kind}:${item.id}`,
      locationLabel: `${entityLabel} · ${item.name || "（空名称）"}`,
      message,
      severity: "error",
      source: "name",
      target: item.kind === "note"
        ? {
            entity: "note",
            kind: "portable-name",
            noteId: item.id,
            owner: "workspace",
          }
        : {
            entity: "folder",
            folderId: item.id,
            kind: "portable-name",
            owner: "workspace",
          },
    };
  });
}

export function createUiSyntaxDiagnostics(
  draft: CtnSyntaxDraft,
  draftResult: CtnSyntaxDraftBuildResult,
  syntaxFileId: string,
  catalogNameConflictMessage = "",
): UiWorkbenchDiagnostic[] {
  const schemaDiagnostics: UiWorkbenchDiagnostic[] =
    draftResult.diagnostics.map((diagnostic) => {
      const location = resolveSyntaxDiagnosticLocation(
        draft,
        diagnostic.path,
      );
      const syntaxName = draft.name.trim() || "未命名语法";

      return {
        code: diagnostic.code,
        id: `syntax:${syntaxFileId}:${diagnostic.code}:${diagnostic.path}`,
        locationLabel: `${syntaxName} · ${location.label}`,
        message: diagnostic.message,
        severity: "error",
        source: "syntax",
        target: {
          fieldId: location.fieldId,
          kind: "syntax-field",
          path: diagnostic.path,
          syntaxFileId,
        },
      };
    });

  if (!catalogNameConflictMessage) {
    return schemaDiagnostics;
  }

  const syntaxName = draft.name.trim() || "未命名语法";
  const conflictDiagnostic: UiWorkbenchDiagnostic = {
    code: "duplicate-syntax-name",
    id: `syntax:${syntaxFileId}:duplicate-syntax-name:$.name`,
    locationLabel: `${syntaxName} · 语法名称`,
    message: catalogNameConflictMessage,
    severity: "error",
    source: "syntax",
    target: {
      fieldId: syntaxFieldIds.name,
      kind: "syntax-field",
      path: "$.name",
      syntaxFileId,
    },
  };

  return [...schemaDiagnostics, conflictDiagnostic];
}

export function createUiSystemSyntaxDiagnostics(
  draft: CtnSyntaxDraft,
  draftResult: CtnSyntaxDraftBuildResult,
  owner: "journal" | "todo",
): UiWorkbenchDiagnostic[] {
  const ownerLabel = owner === "journal" ? "日记" : "代办";

  return draftResult.diagnostics.map((diagnostic) => {
    const location = resolveSyntaxDiagnosticLocation(draft, diagnostic.path);

    return {
      code: diagnostic.code,
      id: `syntax:${owner}:${diagnostic.code}:${diagnostic.path}`,
      locationLabel: `${ownerLabel}语法 · ${location.label}`,
      message: diagnostic.message,
      severity: "error",
      source: "syntax",
      target: {
        fieldId: location.fieldId,
        kind: "system-syntax",
        owner,
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
