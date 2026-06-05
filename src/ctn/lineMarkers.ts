import { createDiagnostic } from "./diagnostics";
import type { CtnBlockType, CtnDiagnostic, CtnMarkerRule } from "./types";

const invalidLineStartMarkers = ["#", "=", "?", "+"];

export type ParsedLineMarker = {
  diagnostics: CtnDiagnostic[];
  label: string;
  marker: string | null;
  text: string;
  textStartColumn: number;
  type: CtnBlockType;
};

export function sortMarkerRules(markerRules: CtnMarkerRule[]): CtnMarkerRule[] {
  return [...markerRules].sort(
    (left, right) => right.marker.length - left.marker.length,
  );
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
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + matchedRule.marker.length + textLeadingWhitespace + 1,
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
        text: textAfterMarker.trim(),
        textStartColumn: indentWidth + marker.length + textLeadingWhitespace + 1,
        type: "text",
      };
    }
  }

  const invalidLineStartMarker = invalidLineStartMarkers.find((marker) =>
    trimmed.startsWith(marker),
  );

  if (invalidLineStartMarker) {
    const textAfterMarker = trimmed.slice(invalidLineStartMarker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [
        createDiagnostic(
          "unknown-marker",
          "warning",
          lineNumber,
          indentWidth + 1,
          `未知行首符号 ${invalidLineStartMarker}。`,
        ),
      ],
      label: "未知符号",
      marker: invalidLineStartMarker,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + invalidLineStartMarker.length + textLeadingWhitespace + 1,
      type: "text",
    };
  }

  return {
    diagnostics: [],
    label: "概念",
    marker: null,
    text: trimmed,
    textStartColumn: indentWidth + 1,
    type: "concept",
  };
}
