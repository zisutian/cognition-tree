// SPDX-License-Identifier: GPL-3.0-or-later

import { createDiagnostic } from "./diagnostics.ts";
import type {
  CtnDiagnostic,
} from "./types.ts";
import type {
  CtnBlockRule,
} from "../syntax/types.ts";

export type ParsedLineMarker = {
  diagnostics: CtnDiagnostic[];
  marker: string | null;
  rule: Readonly<CtnBlockRule> | null;
  text: string;
  textStartColumn: number;
};

function readUnknownLineStartMarker(trimmed: string) {
  return trimmed.match(/^[^\p{L}\p{N}\s_]+/u)?.[0] ?? null;
}

function hasMarkerTextSeparator(trimmed: string, markerLength: number) {
  return markerLength < trimmed.length && /\s/.test(trimmed[markerLength]);
}

export function parseMarker(
  trimmed: string,
  lineNumber: number,
  indentWidth: number,
  blockMatcher: readonly CtnBlockRule[],
): ParsedLineMarker {
  const matchedRule = blockMatcher.find((rule) =>
    trimmed.startsWith(rule.marker)
  );

  if (matchedRule) {
    const textAfterMarker = trimmed.slice(matchedRule.marker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [],
      marker: matchedRule.marker,
      rule: matchedRule,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + matchedRule.marker.length + textLeadingWhitespace + 1,
    };
  }

  if (trimmed.startsWith("[")) {
    const markerEnd = trimmed.indexOf("]");

    if (markerEnd > 0 && hasMarkerTextSeparator(trimmed, markerEnd + 1)) {
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
        marker,
        rule: null,
        text: textAfterMarker.trim(),
        textStartColumn: indentWidth + marker.length + textLeadingWhitespace + 1,
      };
    }
  }

  const unknownLineStartMarker = readUnknownLineStartMarker(trimmed);

  if (
    unknownLineStartMarker &&
    hasMarkerTextSeparator(trimmed, unknownLineStartMarker.length)
  ) {
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
      marker: unknownLineStartMarker,
      rule: null,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + unknownLineStartMarker.length + textLeadingWhitespace + 1,
    };
  }

  return {
    diagnostics: [],
    marker: null,
    rule: null,
    text: trimmed,
    textStartColumn: indentWidth + 1,
  };
}
