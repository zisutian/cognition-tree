import { useVisualizationActivity } from "../../application/workspace/activities/visualization/useVisualizationActivity";
import { useVisualizationFilter } from "../../application/workspace/activities/visualization/useVisualizationFilter";
import AppView from "../../ui/AppView";
import { createVisualizationActivitySlots } from "../../ui/activities/visualization/VisualizationActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveVisualizationActivity({
  application,
  filter,
  onActiveActivityChange,
  workbench,
}: Omit<WorkspaceActivityControllerProps, "active"> & {
  filter: ReturnType<typeof useVisualizationFilter>;
}) {
  const view = useVisualizationActivity({
    filter,
    runtime: application.runtime,
    selection: application.selection,
  });

  return (
    <AppView
      activeActivityId="visualization"
      createActivitySlots={(controls) => createVisualizationActivitySlots({
        ...controls,
        shell: application.shell,
        view,
      })}
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
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
