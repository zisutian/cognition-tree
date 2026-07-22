import type { ActivityId } from "./activityTypes";
import {
  primaryActivityItems,
  utilityActivityItems,
} from "./activityCatalog";

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
        {primaryActivityItems.map((item) => {
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
        {utilityActivityItems.map((item) => {
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
