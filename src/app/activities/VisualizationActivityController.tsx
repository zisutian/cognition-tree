import { useVisualizationActivity } from "../../application/workspace/activities/visualization/useVisualizationActivity";
import { useVisualizationFilter } from "../../application/workspace/activities/visualization/useVisualizationFilter";
import { createVisualizationActivitySlots } from "../../ui/activities/visualization/VisualizationActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveVisualizationActivity({
  application,
  filter,
  renderActivity,
}: Omit<WorkspaceActivityControllerProps, "active"> & {
  filter: ReturnType<typeof useVisualizationFilter>;
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

export function VisualizationActivityController({
  active,
  ...props
}: WorkspaceActivityControllerProps) {
  const filter = useVisualizationFilter();

  return active ? (
    <ActiveVisualizationActivity {...props} filter={filter} />
  ) : null;
}
