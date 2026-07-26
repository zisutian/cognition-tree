// SPDX-License-Identifier: GPL-3.0-or-later

import { createDiagnostic } from "./diagnostics.ts";
import type { CtnDiagnostic } from "./types.ts";

export function normalizeCtnTabSize(tabSize: number) {
  return Math.max(1, Math.floor(tabSize));
}

export function countCtnIndentColumns(
  text: string,
  tabSize: number,
) {
  const normalizedTabSize = normalizeCtnTabSize(tabSize);
  let columns = 0;

  for (const character of text) {
    columns += character === "\t"
      ? normalizedTabSize - (columns % normalizedTabSize)
      : 1;
  }

  return columns;
}

export function createCtnIndentText(
  columns: number,
  tabSize: number,
) {
  const normalizedTabSize = normalizeCtnTabSize(tabSize);
  const normalizedColumns = Math.max(0, Math.floor(columns));
  const tabs = Math.floor(normalizedColumns / normalizedTabSize);
  const spaces = normalizedColumns % normalizedTabSize;

  return `${"\t".repeat(tabs)}${" ".repeat(spaces)}`;
}

export function analyzeIndent(
  indentText: string,
  lineNumber: number,
) {
  const diagnostics: CtnDiagnostic[] = [];
  const tabCount = [...indentText].filter((char) => char === "\t").length;
  const spaceCount = [...indentText].filter((char) => char === " ").length;

  if (spaceCount > 0) {
    diagnostics.push(
      createDiagnostic(
        "space-indent",
        "error",
        lineNumber,
        1,
        "CTN 缩进必须使用 Tab，不能使用空格。",
      ),
    );
  }

  return {
    diagnostics,
    level: tabCount,
  };
}
