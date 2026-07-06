import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";

type ActivityBarProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  onActivityChange: (activityId: ActivityId) => void;
};

export function ActivityBar({
  activeActivityId,
  activityItems,
  onActivityChange,
}: ActivityBarProps) {
  const primaryItems = activityItems.slice(0, 5);
  const secondaryItems = activityItems.slice(5);

  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <div className="activity-brand" aria-hidden="true">
        认
      </div>
      <div className="activity-group">
        {primaryItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-label={item.label}
              className={
                item.id === activeActivityId
                  ? "activity-button active"
                  : "activity-button"
              }
              key={item.id}
              onClick={() => onActivityChange(item.id)}
              title={item.label}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
            </button>
          );
        })}
      </div>
      <div className="activity-group activity-group-bottom">
        {secondaryItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-label={item.label}
              className={
                item.id === activeActivityId
                  ? "activity-button active"
                  : "activity-button"
              }
              key={item.id}
              onClick={() => onActivityChange(item.id)}
              title={item.label}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
