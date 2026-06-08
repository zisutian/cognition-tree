import { createDiagnostic } from "./diagnostics";
import type {
  CtnBlockType,
  CtnDiagnostic,
  CtnMarkerRule,
  CtnRuleRole,
  CtnSyntaxTone,
} from "./types";

export type ParsedLineMarker = {
  diagnostics: CtnDiagnostic[];
  label: string;
  marker: string | null;
  role: CtnRuleRole;
  text: string;
  textStartColumn: number;
  tone: CtnSyntaxTone;
  type: CtnBlockType;
};

export function sortMarkerRules(markerRules: CtnMarkerRule[]): CtnMarkerRule[] {
  return [...markerRules].sort(
    (left, right) => right.marker.length - left.marker.length,
  );
}

function readUnknownLineStartMarker(trimmed: string) {
  return trimmed.match(/^[^\p{L}\p{N}\s_]+/u)?.[0] ?? null;
}

export function parseMarker(
  trimmed: string,
  lineNumber: number,
  indentWidth: number,
  markerRules: CtnMarkerRule[],
): ParsedLineMarker {
  const matchedRule = markerRules.find((rule) => trimmed.startsWith(rule.marker));

  if (matchedRule) {
    const textAfterMarker = trimmed.slice(matchedRule.marker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [],
      label: matchedRule.label,
      marker: matchedRule.marker,
      role: matchedRule.role,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + matchedRule.marker.length + textLeadingWhitespace + 1,
      tone: matchedRule.tone,
      type: matchedRule.type,
    };
  }

  if (trimmed.startsWith("[")) {
    const markerEnd = trimmed.indexOf("]");

    if (markerEnd > 0) {
      const marker = trimmed.slice(0, markerEnd + 1);
      const textAfterMarker = trimmed.slice(marker.length);
      const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

      return {
        diagnostics: [
          createDiagnostic(
            "unknown-marker",
            "warning",
            lineNumber,
            indentWidth + 1,
            `未知行首符号 ${marker}。`,
          ),
        ],
        label: "未知符号",
        marker,
        role: "normal",
        text: textAfterMarker.trim(),
        textStartColumn: indentWidth + marker.length + textLeadingWhitespace + 1,
        tone: "default",
        type: "text",
      };
    }
  }

  const unknownLineStartMarker = readUnknownLineStartMarker(trimmed);

  if (unknownLineStartMarker) {
    const textAfterMarker = trimmed.slice(unknownLineStartMarker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [
        createDiagnostic(
          "unknown-marker",
          "warning",
          lineNumber,
          indentWidth + 1,
          `未知行首符号 ${unknownLineStartMarker}。`,
        ),
      ],
      label: "未知符号",
      marker: unknownLineStartMarker,
      role: "normal",
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + unknownLineStartMarker.length + textLeadingWhitespace + 1,
      tone: "default",
      type: "text",
    };
  }

  return {
    diagnostics: [],
    label: "概念",
    marker: null,
    role: "normal",
    text: trimmed,
    textStartColumn: indentWidth + 1,
    tone: "default",
    type: "concept",
  };
}
