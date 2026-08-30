import type { ActivityId } from "./activityTypes";
import {
  type ActivityDescriptor,
  listActivityDescriptors,
} from "../activities/activityCatalog";

const primaryActivities = listActivityDescriptors("primary");
const managementActivities = listActivityDescriptors("management");

function ActivityGroup({
  activeActivityId,
  activities,
  className = "activity-group",
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  activities: readonly ActivityDescriptor[];
  className?: string;
  onActivityChange: (activityId: ActivityId) => void;
}) {
  return (
    <div className={className}>
      {activities.map((item) => {
        const Icon = item.icon;

        return (
          <button
            aria-current={item.id === activeActivityId ? "page" : undefined}
            aria-label={item.label}
            className={item.id === activeActivityId ? "is-active" : ""}
            key={item.id}
            onClick={() => onActivityChange(item.id)}
            title={item.label}
            type="button"
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
        );
      })}
    </div>
  );
}

export function ActivityBar({
  activeActivityId,
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  onActivityChange: (activityId: ActivityId) => void;
}) {
  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={primaryActivities}
        onActivityChange={onActivityChange}
      />
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={managementActivities}
        className="activity-group activity-group-bottom"
        onActivityChange={onActivityChange}
      />
    </nav>
  );
}
