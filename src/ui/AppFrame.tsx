import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import type {
  ActivityId,
  ActivityItem,
} from "./activityTypes";
import { AppSidebar } from "./AppSidebar";
import {
  appDetailMaxWidth,
  appDetailMinWidth,
} from "./detailResize";

type AppFrameStyle = CSSProperties & {
  "--app-detail-width"?: string;
  "--app-sidebar-width"?: string;
};

type AppFrameProps = {
  activeActivityId: ActivityId;
  activityItems: ActivityItem[];
  detailCollapsed: boolean;
  detailResizeValue: number;
  detailSlot: ReactNode;
  detailWidth: number | null;
  isDetailResizing: boolean;
  isSidebarResizing: boolean;
  mainSlot: ReactNode;
  sidebarCollapsed: boolean;
  sidebarResizeValue: number;
  sidebarSlot: ReactNode;
  sidebarWidth: number | null;
  onActivityChange: (activityId: ActivityId) => void;
  onDetailResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDetailResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailToggle: () => void;
  onSidebarResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSidebarResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function AppFrame({
  activeActivityId,
  activityItems,
  detailCollapsed,
  detailResizeValue,
  detailSlot,
  detailWidth,
  isDetailResizing,
  isSidebarResizing,
  mainSlot,
  sidebarCollapsed,
  sidebarResizeValue,
  sidebarSlot,
  sidebarWidth,
  onActivityChange,
  onDetailResizeKeyDown,
  onDetailResizeStart,
  onDetailToggle,
  onSidebarResizeKeyDown,
  onSidebarResizeStart,
}: AppFrameProps) {
  const hasDetailSlot = detailSlot !== null && detailSlot !== undefined;
  const appFrameClassName = [
    "app-frame",
    `activity-${activeActivityId}`,
    sidebarCollapsed ? "sidebar-collapsed" : "",
    hasDetailSlot && detailCollapsed ? "detail-collapsed" : "",
    isDetailResizing ? "is-resizing-detail" : "",
    isSidebarResizing ? "is-resizing-sidebar" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const appFrameStyle: AppFrameStyle | undefined =
    sidebarWidth === null && detailWidth === null
      ? undefined
      : ({
          ...(detailWidth === null
            ? {}
            : { "--app-detail-width": `${detailWidth}px` }),
          ...(sidebarWidth === null
            ? {}
            : { "--app-sidebar-width": `${sidebarWidth}px` }),
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
      {hasDetailSlot ? (
        <div
          className={
            detailCollapsed
              ? "app-detail-region app-detail-region-collapsed"
              : "app-detail-region"
          }
        >
          {detailCollapsed ? (
            <div className="app-detail-collapsed-header">
              <button
                aria-label="展开右侧栏"
                className="app-detail-toggle"
                onClick={onDetailToggle}
                title="展开右侧栏"
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={15} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <>
              <div
                aria-label="调整右侧栏宽度"
                aria-orientation="vertical"
                aria-valuemax={appDetailMaxWidth}
                aria-valuemin={appDetailMinWidth}
                aria-valuenow={detailResizeValue}
                aria-valuetext={`${detailResizeValue}px`}
                className={
                  isDetailResizing
                    ? "app-detail-resize-handle is-resizing"
                    : "app-detail-resize-handle"
                }
                onKeyDown={onDetailResizeKeyDown}
                onPointerDown={onDetailResizeStart}
                role="separator"
                tabIndex={0}
              />
              {detailSlot}
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}
