import type { VisualizationViewModel } from "../../../application/workspace/activities/visualization/visualizationViewModel";
import "../../styles/activities/visualization.css";
import type { WorkspaceShell } from "../../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../activityTypes";
import { SyntaxUnavailablePanel } from "../../SyntaxUnavailablePanel";
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
        <SyntaxUnavailablePanel
          featureName="引用图谱"
          onConfigureSyntax={onConfigureSyntax}
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
