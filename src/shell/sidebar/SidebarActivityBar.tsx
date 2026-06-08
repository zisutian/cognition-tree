import {
  sidebarActivityItems,
  type SidebarActivityId,
} from "./sidebarConfig";

type SidebarActivityBarProps = {
  activeActivityId: SidebarActivityId;
  onActivityChange: (activityId: SidebarActivityId) => void;
};

export function SidebarActivityBar({
  activeActivityId,
  onActivityChange,
}: SidebarActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <div className="activity-brand" aria-hidden="true">
        认
      </div>
      <div className="activity-group">
        {sidebarActivityItems.slice(0, 5).map((item) => {
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
        {sidebarActivityItems.slice(5).map((item) => {
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
