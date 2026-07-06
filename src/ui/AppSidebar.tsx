import type { ReactNode } from "react";
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";
import { ActivityBar } from "./ActivityBar";

type AppSidebarProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  sidebarSlot: ReactNode;
  onActivityChange: (activityId: ActivityId) => void;
};

export function AppSidebar({
  activeActivityId,
  activityItems,
  sidebarSlot,
  onActivityChange,
}: AppSidebarProps) {
  const activeActivityItem =
    activityItems.find((item) => item.id === activeActivityId) ??
    activityItems[0];

  return (
    <aside className="app-sidebar">
      <ActivityBar
        activeActivityId={activeActivityId}
        activityItems={activityItems}
        onActivityChange={onActivityChange}
      />

      <section className="side-panel" aria-label={activeActivityItem.label}>
        <header className="side-panel-header">
          <h1>{activeActivityItem.label}</h1>
        </header>
        {sidebarSlot}
      </section>
    </aside>
  );
}
