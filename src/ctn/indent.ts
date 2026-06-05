import { createDiagnostic } from "./diagnostics";
import type { CtnDiagnostic } from "./types";

export function analyzeIndent(
  indentText: string,
  lineNumber: number,
  spaceIndentUnit: number,
) {
  const diagnostics: CtnDiagnostic[] = [];
  const tabCount = [...indentText].filter((char) => char === "\t").length;
  const spaceCount = [...indentText].filter((char) => char === " ").length;

  if (tabCount > 0 && spaceCount > 0) {
    diagnostics.push(
      createDiagnostic(
        "mixed-indent",
        "warning",
        lineNumber,
        1,
        "缩进同时包含 Tab 和空格。",
      ),
    );
  }

  if (spaceCount % spaceIndentUnit !== 0) {
    diagnostics.push(
      createDiagnostic(
        "indent-not-multiple",
        "warning",
        lineNumber,
        1,
        `空格缩进不是 ${spaceIndentUnit} 的倍数。`,
      ),
    );
  }

  return {
    diagnostics,
    level: tabCount + Math.floor(spaceCount / spaceIndentUnit),
  };
}
