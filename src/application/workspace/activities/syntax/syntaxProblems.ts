import type { JournalDiagnostics } from "../../../journal/journalDiagnostics";
import type { TodoDiagnostics } from "../../../todo/todoDiagnostics";
import type { WorkbenchDiagnostics } from "../../../problems/workbenchProblems";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../../projection/viewDiagnostics";
import type { SyntaxTarget } from "./syntaxViewModel";

const readyEmptyDiagnostics = {
  diagnostics: [],
  status: "ready" as const,
};

export function createSyntaxActivityDiagnostics({
  activeWorkspaceFileId,
  journalDiagnostics,
  profileDiagnostics,
  selectedTarget,
  todoDiagnostics,
  workspaceDiagnostics,
}: {
  activeWorkspaceFileId: string | null;
  journalDiagnostics: JournalDiagnostics | null;
  profileDiagnostics: UiWorkbenchDiagnostic[];
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
      ...profileDiagnostics,
      ...ownerDiagnostics.diagnostics,
    ],
    status: ownerDiagnostics.status,
  };
}
