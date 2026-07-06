import type {
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";
import { ActivityBar } from "./ActivityBar";
import {
  appSidebarMaxWidth,
  appSidebarMinWidth,
} from "./sidebarResize";

type AppSidebarProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  isSidebarResizing: boolean;
  sidebarCollapsed: boolean;
  sidebarResizeValue: number;
  sidebarSlot: ReactNode;
  onActivityChange: (activityId: ActivityId) => void;
  onSidebarResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSidebarResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function AppSidebar({
  activeActivityId,
  activityItems,
  isSidebarResizing,
  sidebarCollapsed,
  sidebarResizeValue,
  sidebarSlot,
  onActivityChange,
  onSidebarResizeKeyDown,
  onSidebarResizeStart,
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
      {sidebarCollapsed ? null : (
        <div
          aria-label="调整左侧栏宽度"
          aria-orientation="vertical"
          aria-valuemax={appSidebarMaxWidth}
          aria-valuemin={appSidebarMinWidth}
          aria-valuenow={sidebarResizeValue}
          aria-valuetext={`${sidebarResizeValue}px`}
          className={
            isSidebarResizing
              ? "app-sidebar-resize-handle is-resizing"
              : "app-sidebar-resize-handle"
          }
          onKeyDown={onSidebarResizeKeyDown}
          onPointerDown={onSidebarResizeStart}
          role="separator"
          tabIndex={0}
        />
      )}
    </aside>
  );
}
