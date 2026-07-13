import AppView from "../../ui/AppView";
import type { ActivityId } from "../../ui/activityTypes";
import { createPlaceholderActivitySlots } from "../../ui/activities/PlaceholderActivitySlots";
import type { WorkbenchController } from "../../ui/useWorkbenchLayout";

export function PlaceholderActivityController({
  activityId,
  onActiveActivityChange,
  workbench,
}: {
  activityId: "data" | "search";
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
}) {
  return (
    <AppView
      activeActivityId={activityId}
      createActivitySlots={() => createPlaceholderActivitySlots(activityId)}
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  );
}
