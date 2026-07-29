import type { ActivityId } from "./activityTypes";
import {
  listActivityDescriptors,
} from "../activities/activityCatalog";

const primaryActivities = listActivityDescriptors("primary");
const managementActivities = listActivityDescriptors("management");

export function ActivityBar({
  activeActivityId,
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  onActivityChange: (activityId: ActivityId) => void;
}) {
  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <div className="activity-group">
        {primaryActivities.map((item) => {
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
      <div className="activity-group activity-group-bottom">
        {managementActivities.map((item) => {
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
    </nav>
  );
}
