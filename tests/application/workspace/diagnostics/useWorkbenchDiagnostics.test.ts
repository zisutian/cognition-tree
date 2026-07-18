import { describe, expect, it } from "vitest";
import { selectWorkbenchDiagnostics } from "../../../../src/application/workspace/diagnostics/useWorkbenchDiagnostics";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../../src/application/workspace/projection/viewDiagnostics";

const syntaxDiagnostic: UiWorkbenchDiagnostic = {
  code: "required",
  id: "syntax:syntax-main:required:$.name",
  locationLabel: "主要语法 · 语法名称",
  message: "语法名称不能为空。",
  severity: "error",
  source: "syntax",
  target: {
    fieldId: "syntax-profile-name",
    kind: "syntax-field",
    path: "$.name",
    syntaxFileId: "syntax-main",
  },
};

describe("workbench diagnostics selection", () => {
  it("immediately presents an invalid syntax draft without exposing analysis diagnostics", () => {
    const analysisDiagnostics = createUiWorkbenchDiagnostics([
      {
        ...syntaxDiagnostic,
        code: "document-error",
        id: "document:error",
        source: "document",
        target: { kind: "note-line", lineNumber: 1, noteId: "note-a" },
      },
    ], "collecting");

    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics,
      isSyntaxConfigured: true,
      syntaxDiagnostics: [syntaxDiagnostic],
    })).toEqual({
      diagnostics: [syntaxDiagnostic],
      errorCount: 1,
      status: "ready",
      warningCount: 0,
    });
  });

  it("returns an empty ready view before workspace syntax is configured", () => {
    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics: createUiWorkbenchDiagnostics([], "collecting"),
      isSyntaxConfigured: false,
      syntaxDiagnostics: [],
    })).toEqual({
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    });
  });

  it("reuses the single analysis diagnostic view for valid syntax", () => {
    const analysisDiagnostics = createUiWorkbenchDiagnostics([], "collecting");

    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics,
      isSyntaxConfigured: true,
      syntaxDiagnostics: [],
    })).toBe(analysisDiagnostics);
  });
});
