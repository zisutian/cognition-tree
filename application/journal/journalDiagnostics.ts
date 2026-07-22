// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalParseIndex } from "../../core/journal/indexes/journalParseIndex";
import {
  createJournalEntryBodyProjection,
  type JournalEntryId,
} from "../../core/journal/model/journalContent";
import type { JournalWorkspaceReferenceResolutionState } from "./journalExternalReferences";

export type JournalDiagnosticSeverity = "error" | "warning";
export type JournalDiagnosticSource =
  | "document"
  | "reference"
  | "workspace-reference";

export type JournalDiagnostic = {
  code: string;
  id: string;
  locationLabel: string;
  message: string;
  severity: JournalDiagnosticSeverity;
  source: JournalDiagnosticSource;
  target: {
    entryId: JournalEntryId;
    kind: "journal-entry-line";
    lineNumber: number;
  };
};

export type JournalDiagnostics = {
  diagnostics: JournalDiagnostic[];
  errorCount: number;
  status: "ready";
  warningCount: number;
};

function compareJournalDiagnostics(
  left: JournalDiagnostic,
  right: JournalDiagnostic,
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

function createBodyLineProjector(
  index: JournalParseIndex,
  entryId: JournalEntryId,
) {
  const parsed = index.getParsedEntry(entryId);

  if (!parsed) {
    return (lineNumber: number) => Math.max(1, Math.floor(lineNumber));
  }
  const projection = createJournalEntryBodyProjection(
    parsed.entry,
    index.syntaxProfile,
  );

  return (lineNumber: number) =>
    projection.projectCanonicalLineNumber(lineNumber);
}

export function createJournalDocumentDiagnostics(
  index: JournalParseIndex,
): JournalDiagnostic[] {
  return index.entries.flatMap((parsed) => {
    const projectLineNumber = createBodyLineProjector(
      index,
      parsed.entry.id,
    );

    return parsed.document.diagnostics.map((diagnostic) => {
      const lineNumber = projectLineNumber(diagnostic.lineNumber);

      return {
        code: diagnostic.code,
        id: `journal:document:${parsed.entry.id}:${diagnostic.id}`,
        locationLabel:
          `${parsed.title} · L${lineNumber}:C${diagnostic.column}`,
        message: diagnostic.message,
        severity: diagnostic.severity,
        source: "document" as const,
        target: {
          entryId: parsed.entry.id,
          kind: "journal-entry-line" as const,
          lineNumber,
        },
      };
    });
  });
}

export function createJournalReferenceDiagnostics(
  index: JournalParseIndex,
): JournalDiagnostic[] {
  const createDiagnostic = (
    reference: JournalParseIndex["referenceGraph"]["unresolvedReferences"][number],
    kind: "ambiguous" | "unresolved",
    candidateCount = 0,
  ): JournalDiagnostic => {
    const parsed = index.getParsedEntry(reference.sourceEntryId);
    const lineNumber = createBodyLineProjector(
      index,
      reference.sourceEntryId,
    )(reference.lineNumber);
    const title = parsed?.title ?? reference.sourceEntryId;
    const occurrenceLabel = reference.count > 1
      ? `（${reference.count} 处）`
      : "";
    const message = kind === "ambiguous"
      ? `日记引用“${reference.targetText}”匹配 ${candidateCount} 条同名日记${occurrenceLabel}，请选择具体目标。`
      : `无法解析日记引用“${reference.targetText}”${occurrenceLabel}。`;

    return {
      code: `${kind}-journal-reference`,
      id:
        `journal:reference:${kind}:${reference.sourceEntryId}:${reference.targetText}`,
      locationLabel: `${title} · L${lineNumber}`,
      message,
      severity: "warning",
      source: "reference",
      target: {
        entryId: reference.sourceEntryId,
        kind: "journal-entry-line",
        lineNumber,
      },
    };
  };

  return [
    ...index.referenceGraph.unresolvedReferences.map((reference) =>
      createDiagnostic(reference, "unresolved")
    ),
    ...index.referenceGraph.ambiguousReferences.map((reference) =>
      createDiagnostic(
        reference,
        "ambiguous",
        reference.candidateEntryIds.length,
      )
    ),
    ...index.referenceGraph.invalidWorkspaceReferences.map((reference) => {
      const parsed = index.getParsedEntry(reference.sourceEntryId);
      const lineNumber = createBodyLineProjector(
        index,
        reference.sourceEntryId,
      )(reference.lineNumber);

      return {
        code: "invalid-workspace-journal-reference",
        id:
          `journal:reference:invalid-workspace:${reference.sourceEntryId}:${reference.targetText}`,
        locationLabel:
          `${parsed?.title ?? reference.sourceEntryId} · L${lineNumber}`,
        message: `跨仓日记引用“${reference.targetText}”必须使用“仓库名:笔记名”，且两部分均为可移植名称。`,
        severity: "warning" as const,
        source: "reference" as const,
        target: {
          entryId: reference.sourceEntryId,
          kind: "journal-entry-line" as const,
          lineNumber,
        },
      };
    }),
  ];
}

export function createJournalDiagnostics(
  index: JournalParseIndex,
  workspaceReferences: JournalWorkspaceReferenceResolutionState = {
    status: "idle",
  },
): JournalDiagnostics {
  const workspaceDiagnostics: JournalDiagnostic[] =
    workspaceReferences.status === "ready"
      ? workspaceReferences.resolutions.flatMap((resolution) => {
          if (resolution.status === "resolved") return [];
          const lineNumber = createBodyLineProjector(
            index,
            resolution.reference.sourceEntryId,
          )(resolution.reference.lineNumber);
          const parsed = index.getParsedEntry(
            resolution.reference.sourceEntryId,
          );

          return [{
            code: resolution.code,
            id:
              `journal:workspace-reference:${resolution.code}:${resolution.reference.sourceEntryId}:${resolution.reference.targetText}`,
            locationLabel:
              `${parsed?.title ?? resolution.reference.sourceEntryId} · L${lineNumber}`,
            message: resolution.message,
            severity: "warning" as const,
            source: "workspace-reference" as const,
            target: {
              entryId: resolution.reference.sourceEntryId,
              kind: "journal-entry-line" as const,
              lineNumber,
            },
          }];
        })
      : [];
  const diagnostics = [...new Map(
    [
      ...createJournalDocumentDiagnostics(index),
      ...createJournalReferenceDiagnostics(index),
      ...workspaceDiagnostics,
    ].map((diagnostic) => [diagnostic.id, diagnostic]),
  ).values()].sort(compareJournalDiagnostics);

  return {
    diagnostics,
    errorCount: diagnostics.filter(({ severity }) => severity === "error")
      .length,
    status: "ready",
    warningCount: diagnostics.filter(({ severity }) => severity === "warning")
      .length,
  };
}
