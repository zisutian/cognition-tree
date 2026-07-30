import type { VisualizationViewModel } from "../../../../application/workspace/activities/visualization/visualizationViewModel";
import "../../../ui/styles/activities/visualization.css";
import type { WorkspaceShell } from "../../bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../../ui/activityTypes";
import { SyntaxUnavailablePanel } from "../../../ui/SyntaxUnavailablePanel";
import { VisualizationContext } from "./VisualizationContext";
import { VisualizationDetailPanel } from "./VisualizationDetailPanel";
import { VisualizationPanel } from "./VisualizationPanel";
import type {
  ReferenceGraphSession,
} from "./useReferenceGraphSession";

export function createVisualizationActivitySlots({
  onCollapseDetail,
  onConfigureSyntax,
  session,
  shell,
  view,
}: {
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  session: ReferenceGraphSession;
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
    context: {
      content: <VisualizationContext session={session} view={view} />,
      title: "引用图谱",
    },
    detail: (
      <VisualizationDetailPanel
        onCollapseDetail={onCollapseDetail}
        view={view}
      />
    ),
    main: <VisualizationPanel session={session} view={view} />,
  };
}
