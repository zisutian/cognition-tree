import type { VisualizationViewModel } from "../../../application/workspace/activities/visualization/visualizationViewModel";
import type { WorkspaceShell } from "../../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../activityTypes";
import { WorkspaceSyntaxSetupView } from "../../WorkspaceSyntaxSetupView";
import { VisualizationDetailPanel } from "./VisualizationDetailPanel";
import { VisualizationPanel } from "./VisualizationPanel";

export function createVisualizationActivitySlots({
  onCollapseDetail,
  onConfigureSyntax,
  shell,
  view,
}: {
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  shell: WorkspaceShell;
  view: VisualizationViewModel;
}): ActivitySlots {
  if (!shell.hasConfiguredSyntax) {
    return {
      context: null,
      detail: null,
      main: (
        <WorkspaceSyntaxSetupView
          errorMessage={shell.errorMessage}
          onConfigureSyntax={onConfigureSyntax}
          onUseDefaultSyntax={shell.useDefaultSyntax}
        />
      ),
    };
  }

  return {
    context: null,
    detail: (
      <VisualizationDetailPanel
        onCollapseDetail={onCollapseDetail}
        view={view}
      />
    ),
    main: <VisualizationPanel view={view} />,
  };
}
