import type { JournalDiagnostics } from "../../journal/index.ts";
import type { TodoDiagnostics } from "../../todo/index.ts";
import type { SyntaxTarget } from "../../syntax/index.ts";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../../workspace/index.ts";
import type { WorkbenchDiagnostics } from "./workbenchProblems.ts";

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
