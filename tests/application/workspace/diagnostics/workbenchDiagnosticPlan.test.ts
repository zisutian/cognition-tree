import { describe, expect, it } from "vitest";
import type { UiWorkbenchDiagnostic } from "../../../../src/application/workspace/projection/viewDiagnostics";
import { createWorkbenchDiagnosticPlan } from "../../../../src/application/workspace/diagnostics/workbenchDiagnosticPlan";

const syntaxDiagnostic: UiWorkbenchDiagnostic = {
  code: "required",
  id: "syntax:required:$.name",
  locationLabel: "仓库语法 · 语法名称",
  message: "语法名称不能为空。",
  severity: "error",
  source: "syntax",
  target: {
    fieldId: "syntax-profile-name",
    kind: "syntax-field",
    path: "$.name",
  },
};

describe("workbench diagnostic plan", () => {
  it("immediately replaces workspace results with invalid syntax diagnostics", () => {
    const plan = createWorkbenchDiagnosticPlan({
      canCollectWorkspace: true,
      syntaxDiagnostics: [syntaxDiagnostic],
    });

    expect(plan.initialView).toEqual({
      diagnostics: [syntaxDiagnostic],
      errorCount: 1,
      status: "ready",
      warningCount: 0,
    });
    expect(plan.collectWorkspace).toBe(false);
  });

  it("does not collect CTN diagnostics without configured syntax", () => {
    expect(createWorkbenchDiagnosticPlan({
      canCollectWorkspace: false,
      syntaxDiagnostics: [],
    })).toEqual({
      collectWorkspace: false,
      initialView: expect.objectContaining({ diagnostics: [], status: "ready" }),
    });
  });

  it("enters collecting state only for a valid configured workspace", () => {
    expect(createWorkbenchDiagnosticPlan({
      canCollectWorkspace: true,
      syntaxDiagnostics: [],
    })).toEqual({
      collectWorkspace: true,
      initialView: expect.objectContaining({
        diagnostics: [],
        status: "collecting",
      }),
    });
  });
});
