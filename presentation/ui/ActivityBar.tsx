// SPDX-License-Identifier: GPL-3.0-or-later

import type { ActivityId, ActivityNavigationItem } from "./activityTypes";

function ActivityGroup({
  activeActivityId,
  activities,
  className = "activity-group",
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  activities: readonly ActivityNavigationItem[];
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
  activities,
  activeActivityId,
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  activities: readonly ActivityNavigationItem[];
  onActivityChange: (activityId: ActivityId) => void;
}) {
  return (
    <nav className="activity-bar" aria-label="工作区功能">
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={activities.filter(({ group }) => group === "primary")}
        onActivityChange={onActivityChange}
      />
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={activities.filter(({ group }) => group === "management")}
        className="activity-group activity-group-bottom"
        onActivityChange={onActivityChange}
      />
    </nav>
  );
}
