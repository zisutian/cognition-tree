import type { ReactNode } from "react";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { UiWorkbenchDiagnostic } from "../../application/workspace/projection/viewDiagnostics";
import type { ActivityId } from "../../ui/activityTypes";
import { ProblemsPanel } from "../../ui/problems/ProblemsPanel";
import { useWorkbenchProblemsShortcut } from "../../ui/problems/useProblemsShortcut";
import type { WorkbenchController } from "../../ui/workbench/useWorkbenchLayout";

export function WorkbenchProblemsController({
  application,
  children,
  onActiveActivityChange,
  workbench,
}: {
  application: Pick<WorkspaceApplication, "diagnostics" | "navigation">;
  children: (problemsSlot: ReactNode) => ReactNode;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
}) {
  const openDiagnostic = (diagnostic: UiWorkbenchDiagnostic) => {
    if (diagnostic.target.kind === "note-line") {
      application.navigation.openNoteLine(
        diagnostic.target.noteId,
        diagnostic.target.lineNumber,
      );
      onActiveActivityChange("notes");
    } else {
      application.navigation.openSyntaxField(diagnostic.target.fieldId);
      onActiveActivityChange("syntax");
    }

    workbench.expandPanels();
  };

  useWorkbenchProblemsShortcut(workbench.toggleProblems);

  return children(
    <ProblemsPanel
      expanded={workbench.layout.problemsExpanded}
      onOpen={openDiagnostic}
      onToggle={workbench.toggleProblems}
      view={application.diagnostics}
    />,
  );
}
