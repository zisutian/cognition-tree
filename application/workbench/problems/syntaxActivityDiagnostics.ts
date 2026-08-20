import type { JournalDiagnostics } from "../../journal/journalDiagnostics";
import type { TodoDiagnostics } from "../../todo/todoDiagnostics";
import type { SyntaxTarget } from "../../syntax/syntaxViewModel";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../../workspace/projection/viewDiagnostics";
import type { WorkbenchDiagnostics } from "./workbenchProblems";

const readyEmptyDiagnostics = {
  diagnostics: [],
  status: "ready" as const,
};

export function createSyntaxActivityDiagnostics({
  activeWorkspaceFileId,
  journalDiagnostics,
  syntaxDiagnostics,
  selectedTarget,
  todoDiagnostics,
  workspaceDiagnostics,
}: {
  activeWorkspaceFileId: string | null;
  journalDiagnostics: JournalDiagnostics | null;
  syntaxDiagnostics: UiWorkbenchDiagnostic[];
  selectedTarget: SyntaxTarget;
  todoDiagnostics: TodoDiagnostics | null;
  workspaceDiagnostics: UiWorkbenchDiagnostics | null;
}): WorkbenchDiagnostics {
  const ownerDiagnostics = (() => {
    if (selectedTarget.kind === "journal") {
      return journalDiagnostics ?? readyEmptyDiagnostics;
    }
    if (selectedTarget.kind === "todo") {
      return todoDiagnostics ?? readyEmptyDiagnostics;
    }
    return selectedTarget.fileId === activeWorkspaceFileId &&
        workspaceDiagnostics
      ? workspaceDiagnostics
      : readyEmptyDiagnostics;
  })();

  return {
    diagnostics: [
      ...syntaxDiagnostics,
      ...ownerDiagnostics.diagnostics,
    ],
    status: ownerDiagnostics.status,
  };
}
