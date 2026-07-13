import type { CSSProperties, ReactNode } from "react";
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
import type { WorkbenchLayout } from "./useWorkbenchLayout";

type AppFrameStyle = CSSProperties & {
  "--app-context-width"?: string;
  "--app-detail-width"?: string;
};

export function AppFrame({
  activeActivityId,
  contextSlot,
  detailSlot,
  layout,
  mainSlot,
  onActivityChange,
}: {
  activeActivityId: ActivityId;
  contextSlot: ActivityContextSlot | null;
  detailSlot: ReactNode | null;
  layout: WorkbenchLayout;
  mainSlot: ReactNode;
  onActivityChange: (activityId: ActivityId) => void;
}) {
  const {
    contextCollapsed,
    contextResizeValue,
    contextWidth,
    detailCollapsed,
    detailResizeValue,
    detailWidth,
    isContextResizing,
    isDetailResizing,
    onContextResizeKeyDown,
    onContextResizeStart,
    onDetailResizeKeyDown,
    onDetailResizeStart,
    onDetailToggle,
  } = layout;
  const hasContext = contextSlot !== null;
  const showContext = hasContext && !contextCollapsed;
  const hasDetail = detailSlot !== null;
  const frameClassName = [
    "app-frame",
    showContext ? "has-context" : "no-context",
    hasDetail ? "has-detail" : "no-detail",
    detailCollapsed && hasDetail ? "detail-collapsed" : "",
    isContextResizing ? "is-resizing-context" : "",
    isDetailResizing ? "is-resizing-detail" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style: AppFrameStyle = {
    ...(contextWidth === null
      ? {}
      : { "--app-context-width": `${contextWidth}px` }),
    ...(detailWidth === null
      ? {}
      : { "--app-detail-width": `${detailWidth}px` }),
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
