import { useVisualizationActivity } from "../../application/workspace/activities/visualization/useVisualizationActivity";
import { useVisualizationFilter } from "../../application/workspace/activities/visualization/useVisualizationFilter";
import { createVisualizationActivitySlots } from "../../ui/activities/visualization/VisualizationActivitySlots";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { WorkspaceActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveVisualizationActivity({
  application,
  filter,
  renderActivity,
}: {
  application: WorkspaceApplication;
  filter: ReturnType<typeof useVisualizationFilter>;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
}) {
  const view = useVisualizationActivity({
    filter,
    runtime: application.runtime,
    selection: application.selection,
  });

  return renderActivity((controls) =>
    createVisualizationActivitySlots({
      onCollapseDetail: controls.onCollapseDetail,
      onConfigureSyntax: controls.onConfigureSyntax,
      shell: application.shell,
      view,
    }),
  );
}

function ReadyVisualizationActivity({
  application,
  renderActivity,
}: {
  application: WorkspaceApplication;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
}) {
  const filter = useVisualizationFilter();

  return (
    <ActiveVisualizationActivity
      application={application}
      filter={filter}
      renderActivity={renderActivity}
    />
  );
}

export function VisualizationActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  if (!active) {
    return null;
  }
  if (application.workspace.status !== "ready") {
    return renderWorkspaceUnavailableActivity({
      onOpenRepository: () => onActiveActivityChange("repository"),
      renderActivity,
      workspace: application.workspace,
    });
  }

  return (
    <ReadyVisualizationActivity
      application={application.workspace.application}
      renderActivity={renderActivity}
    />
  );
}
