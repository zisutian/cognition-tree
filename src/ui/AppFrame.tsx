import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";
import { AppSidebar } from "./AppSidebar";

type AppFrameStyle = CSSProperties & {
  "--app-sidebar-width"?: string;
};

type AppFrameProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  detailSlot: ReactNode;
  isSidebarResizing: boolean;
  mainSlot: ReactNode;
  sidebarCollapsed: boolean;
  sidebarResizeValue: number;
  sidebarSlot: ReactNode;
  sidebarWidth: number | null;
  onActivityChange: (activityId: ActivityId) => void;
  onSidebarResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSidebarResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function AppFrame({
  activeActivityId,
  activityItems,
  detailSlot,
  isSidebarResizing,
  mainSlot,
  sidebarCollapsed,
  sidebarResizeValue,
  sidebarSlot,
  sidebarWidth,
  onActivityChange,
  onSidebarResizeKeyDown,
  onSidebarResizeStart,
}: AppFrameProps) {
  const appFrameClassName = [
    "app-frame",
    `activity-${activeActivityId}`,
    sidebarCollapsed ? "sidebar-collapsed" : "",
    isSidebarResizing ? "is-resizing-sidebar" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const appFrameStyle: AppFrameStyle | undefined =
    sidebarWidth === null
      ? undefined
      : ({
          "--app-sidebar-width": `${sidebarWidth}px`,
        } as AppFrameStyle);

  return (
    <main className={appFrameClassName} style={appFrameStyle}>
      <AppSidebar
        activeActivityId={activeActivityId}
        activityItems={activityItems}
        isSidebarResizing={isSidebarResizing}
        sidebarCollapsed={sidebarCollapsed}
        sidebarResizeValue={sidebarResizeValue}
        sidebarSlot={sidebarSlot}
        onActivityChange={onActivityChange}
        onSidebarResizeKeyDown={onSidebarResizeKeyDown}
        onSidebarResizeStart={onSidebarResizeStart}
      />

      {mainSlot}
      {detailSlot}
    </main>
  );
}
