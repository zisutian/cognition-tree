import type { ReactNode } from "react";
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";
import { AppSidebar } from "./AppSidebar";

type AppFrameProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  detailSlot: ReactNode;
  mainSlot: ReactNode;
  sidebarCollapsed: boolean;
  sidebarSlot: ReactNode;
  onActivityChange: (activityId: ActivityId) => void;
};

export function AppFrame({
  activeActivityId,
  activityItems,
  detailSlot,
  mainSlot,
  sidebarCollapsed,
  sidebarSlot,
  onActivityChange,
}: AppFrameProps) {
  const appFrameClassName = [
    "app-frame",
    `activity-${activeActivityId}`,
    sidebarCollapsed ? "sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={appFrameClassName}>
      <AppSidebar
        activeActivityId={activeActivityId}
        activityItems={activityItems}
        sidebarSlot={sidebarSlot}
        onActivityChange={onActivityChange}
      />

      {mainSlot}
      {detailSlot}
    </main>
  );
}
