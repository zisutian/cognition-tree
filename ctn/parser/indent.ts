// SPDX-License-Identifier: GPL-3.0-or-later

import { createDiagnostic } from "./diagnostics.ts";
import type { CtnDiagnostic } from "./types.ts";

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
