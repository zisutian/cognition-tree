import appFrameStyles from "./AppFrame.module.css";
import { Button } from "./shared/Button.tsx";
import { createClassNames } from "./shared/classNames.ts";
const cx = createClassNames(appFrameStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ActivityId, ActivityNavigationItem } from "./activityTypes.ts";

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
    <div className={cx(className)}>
      {activities.map((item) => {
        const Icon = item.icon;

        return (
          <Button
            variant="activity"
            aria-current={item.id === activeActivityId ? "page" : undefined}
            aria-label={item.label}
            key={item.id}
            onClick={() => onActivityChange(item.id)}
            title={item.label}
            type="button"
          >
            <Icon aria-hidden="true" strokeWidth={1.5} />
          </Button>
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
    <nav className={cx("activity-bar")} aria-label="工作区功能">
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={activities.filter(({ group }) => group === "primary")}
        onActivityChange={onActivityChange}
      />
      <ActivityGroup
        activeActivityId={activeActivityId}
        activities={activities.filter(({ group }) => group === "management")}
        className={cx("activity-group activity-group-bottom")}
        onActivityChange={onActivityChange}
      />
    </nav>
  );
}
