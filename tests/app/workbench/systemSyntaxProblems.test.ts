import { describe, expect, it, vi } from "vitest";
import {
  openWorkbenchProblem,
  selectWorkbenchProblems,
} from "../../../src/app/workbench/WorkbenchProblemsController";
import { createUiWorkbenchDiagnostics } from "../../../src/application/workspace/projection/viewDiagnostics";
import type { UiWorkbenchDiagnostic } from "../../../src/application/workspace/projection/viewDiagnostics";

const systemSyntaxDiagnostic: UiWorkbenchDiagnostic = {
  code: "required",
  id: "syntax:journal:required:body.label",
  locationLabel: "日记语法 · 顶格正文 · 名称",
  message: "顶格正文名称不能为空。",
  severity: "error",
  source: "syntax",
  target: {
    fieldId: "syntax-top-level-unmarked-rule",
    kind: "system-syntax",
    owner: "journal",
    path: "body.label",
  },
};

describe("system syntax problems", () => {
  it("projects only the selected syntax owner diagnostics", () => {
    expect(selectWorkbenchProblems({
      activeActivityId: "syntax",
      diagnostics: createUiWorkbenchDiagnostics([], "ready"),
      repositories: [],
      repositoryIssues: [],
      syntaxDiagnostics: {
        diagnostics: [systemSyntaxDiagnostic],
        status: "ready",
      },
      systemIssues: [],
    })).toEqual({
      errorCount: 1,
      problems: [systemSyntaxDiagnostic],
      status: "ready",
      warningCount: 0,
    });
  });

  it("selects the system owner before opening Syntax", () => {
    const openSystemSyntax = vi.fn();
    const onActiveActivityChange = vi.fn();

    openWorkbenchProblem(systemSyntaxDiagnostic, {
      expandPanels: vi.fn(),
      onActiveActivityChange,
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusSystemRepository: vi.fn(),
      },
      syntaxNavigation: { openSystemSyntax },
      workspaceNavigation: null,
    });

    expect(openSystemSyntax).toHaveBeenCalledWith(
      "journal",
      "syntax-top-level-unmarked-rule",
    );
    expect(onActiveActivityChange).toHaveBeenCalledWith("syntax");
  });
});
