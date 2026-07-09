import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import type {
  ActivityContextSlot,
  ActivityId,
} from "./activityTypes";
import { ActivityBar } from "./ActivityBar";
import {
  appContextMaxWidth,
  appContextMinWidth,
  appDetailMaxWidth,
  appDetailMinWidth,
} from "./frameResize";
import { Button } from "./shared/primitives";

type AppFrameStyle = CSSProperties & {
  "--app-context-width"?: string;
  "--app-detail-width"?: string;
};

export function AppFrame({
  activeActivityId,
  contextCollapsed,
  contextResizeValue,
  contextSlot,
  contextWidth,
  detailCollapsed,
  detailResizeValue,
  detailSlot,
  detailWidth,
  isContextResizing,
  isDetailResizing,
  mainSlot,
  mainSpan,
  onActivityChange,
  onContextResizeKeyDown,
  onContextResizeStart,
  onDetailResizeKeyDown,
  onDetailResizeStart,
  onDetailToggle,
}: {
  activeActivityId: ActivityId;
  contextCollapsed: boolean;
  contextResizeValue: number;
  contextSlot: ActivityContextSlot | null;
  contextWidth: number | null;
  detailCollapsed: boolean;
  detailResizeValue: number;
  detailSlot: ReactNode | null;
  detailWidth: number | null;
  isContextResizing: boolean;
  isDetailResizing: boolean;
  mainSlot: ReactNode;
  mainSpan: "full" | "standard";
  onActivityChange: (activityId: ActivityId) => void;
  onContextResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onContextResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDetailResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailToggle: () => void;
}) {
  const hasContext = contextSlot !== null;
  const showContext = hasContext && !contextCollapsed;
  const hasDetail = detailSlot !== null;
  const frameClassName = [
    "app-frame",
    `activity-${activeActivityId}`,
    showContext ? "has-context" : "no-context",
    hasDetail ? "has-detail" : "no-detail",
    detailCollapsed && hasDetail ? "detail-collapsed" : "",
    mainSpan === "full" ? "main-full" : "main-standard",
    isContextResizing ? "is-resizing-context" : "",
    isDetailResizing ? "is-resizing-detail" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style: AppFrameStyle = {
    ...(contextWidth === null ? {} : { "--app-context-width": `${contextWidth}px` }),
    ...(detailWidth === null ? {} : { "--app-detail-width": `${detailWidth}px` }),
  };

  return (
    <main className={frameClassName} style={style}>
      <ActivityBar
        activeActivityId={activeActivityId}
        onActivityChange={onActivityChange}
      />
      {showContext ? (
        <aside className="app-context" aria-label={contextSlot.title}>
          <header className="app-context-header">
            <h1>{contextSlot.title}</h1>
          </header>
          <div className="app-context-body">{contextSlot.content}</div>
          <div
            aria-label="调整上下文区宽度"
            aria-orientation="vertical"
            aria-valuemax={appContextMaxWidth}
            aria-valuemin={appContextMinWidth}
            aria-valuenow={contextResizeValue}
            aria-valuetext={`${contextResizeValue}px`}
            className="app-resize-handle app-context-resize"
            onKeyDown={onContextResizeKeyDown}
            onPointerDown={onContextResizeStart}
            role="separator"
            tabIndex={0}
          />
        </aside>
      ) : null}
      <section className="app-main-region">{mainSlot}</section>
      {hasDetail ? (
        <aside
          className={
            detailCollapsed
              ? "app-detail app-detail-collapsed"
              : "app-detail"
          }
        >
          {detailCollapsed ? (
            <header className="app-detail-collapsed-header">
              <Button
                aria-label="展开右侧详情"
                className="app-detail-toggle"
                onClick={onDetailToggle}
                title="展开右侧详情"
                type="button"
                variant="icon"
              >
                <ChevronLeft aria-hidden="true" size={14} />
              </Button>
            </header>
          ) : (
            <>
              <div
                aria-label="调整右侧详情宽度"
                aria-orientation="vertical"
                aria-valuemax={appDetailMaxWidth}
                aria-valuemin={appDetailMinWidth}
                aria-valuenow={detailResizeValue}
                aria-valuetext={`${detailResizeValue}px`}
                className="app-resize-handle app-detail-resize"
                onKeyDown={onDetailResizeKeyDown}
                onPointerDown={onDetailResizeStart}
                role="separator"
                tabIndex={0}
              />
              {detailSlot}
            </>
          )}
        </aside>
      ) : null}
    </main>
  );
}
