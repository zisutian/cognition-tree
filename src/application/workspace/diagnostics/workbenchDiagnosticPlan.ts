import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../projection/viewDiagnostics";

export type WorkbenchDiagnosticPlan = {
  collectWorkspace: boolean;
  initialView: ReturnType<typeof createUiWorkbenchDiagnostics>;
};

export function createWorkbenchDiagnosticPlan({
  canCollectWorkspace,
  syntaxDiagnostics,
}: {
  canCollectWorkspace: boolean;
  syntaxDiagnostics: UiWorkbenchDiagnostic[];
}): WorkbenchDiagnosticPlan {
  if (syntaxDiagnostics.length > 0) {
    return {
      collectWorkspace: false,
      initialView: createUiWorkbenchDiagnostics(syntaxDiagnostics, "ready"),
    };
  }

  return {
    collectWorkspace: canCollectWorkspace,
    initialView: createUiWorkbenchDiagnostics(
      [],
      canCollectWorkspace ? "collecting" : "ready",
    ),
  };
}
