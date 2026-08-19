import { describe, expect, it } from "vitest";
import { selectWorkbenchDiagnostics } from "../../../../presentation/workspace/diagnostics/useWorkbenchDiagnostics";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../../application/workspace/projection/viewDiagnostics";

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

const portableNameDiagnostic: UiWorkbenchDiagnostic = {
  code: "nonportable-workspace-note-name",
  id: "portable-name:workspace:note:note-old",
  locationLabel: "笔记 · 旧:标题",
  message: "笔记名称包含不可移植字符，请手工重命名。",
  severity: "error",
  source: "name",
  target: {
    entity: "note",
    kind: "portable-name",
    noteId: "note-old",
    owner: "workspace",
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
      portableNameDiagnostics: [],
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
      portableNameDiagnostics: [],
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
      portableNameDiagnostics: [],
      syntaxDiagnostics: [],
    })).toBe(analysisDiagnostics);
  });

  it("keeps portable-name diagnostics in raw mode and beside syntax errors", () => {
    const collecting = createUiWorkbenchDiagnostics([], "collecting");

    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics: collecting,
      isSyntaxConfigured: false,
      portableNameDiagnostics: [portableNameDiagnostic],
      syntaxDiagnostics: [],
    })).toMatchObject({
      diagnostics: [portableNameDiagnostic],
      errorCount: 1,
      status: "ready",
    });
    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics: collecting,
      isSyntaxConfigured: true,
      portableNameDiagnostics: [portableNameDiagnostic],
      syntaxDiagnostics: [syntaxDiagnostic],
    })).toMatchObject({
      diagnostics: [portableNameDiagnostic, syntaxDiagnostic],
      errorCount: 2,
      status: "ready",
    });
  });

  it("retains analysis collection status while merging name diagnostics", () => {
    const analysisDiagnostic = {
      ...syntaxDiagnostic,
      code: "document-error",
      id: "document:error",
      source: "document" as const,
      target: { kind: "note-line" as const, lineNumber: 1, noteId: "note-a" },
    };

    expect(selectWorkbenchDiagnostics({
      analysisDiagnostics: createUiWorkbenchDiagnostics(
        [analysisDiagnostic],
        "collecting",
      ),
      isSyntaxConfigured: true,
      portableNameDiagnostics: [portableNameDiagnostic],
      syntaxDiagnostics: [],
    })).toMatchObject({
      diagnostics: [portableNameDiagnostic, analysisDiagnostic],
      errorCount: 2,
      status: "collecting",
    });
  });
});
