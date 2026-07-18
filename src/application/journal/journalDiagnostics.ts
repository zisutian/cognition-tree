// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalParseIndex } from "../../../journal/indexes/journalParseIndex";
import {
  createJournalEntryBodyProjection,
  type JournalEntryId,
} from "../../../journal/model/journalContent";

export type JournalDiagnosticSeverity = "error" | "warning";
export type JournalDiagnosticSource = "document" | "reference";

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
  const projection = createJournalEntryBodyProjection(parsed.entry);

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
  ];
}

export function createJournalDiagnostics(
  index: JournalParseIndex,
): JournalDiagnostics {
  const diagnostics = [...new Map(
    [
      ...createJournalDocumentDiagnostics(index),
      ...createJournalReferenceDiagnostics(index),
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
