import appFrameStyles from "./AppFrame.module.css";
import { RegionFrame } from "./RegionFrame.tsx";
import { createClassNames } from "./shared/classNames.ts";
const cx = createClassNames(appFrameStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import { ChevronLeft } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ActivityContextSlot,
  ActivityId,
  ActivityNavigationItem,
  ActivityRegionSlot,
} from "./activityTypes.ts";

import { ActivityBar } from "./ActivityBar.tsx";
import { Button } from "./shared/Button.tsx";
import {
  appContextMaxWidth,
  appContextMinWidth,
  appDetailMaxWidth,
  appDetailMinWidth,
  appProblemsMaxHeight,
  appProblemsMinHeight,
} from "./workbench/frameResize.ts";
import type { WorkbenchLayout } from "./workbench/useWorkbenchLayout.ts";

type AppFrameStyle = CSSProperties & {
  "--app-context-width"?: string;
  "--app-detail-width"?: string;
  "--app-problems-height"?: string;
};

export function AppFrame({
  activeActivityId,
  activityItems,
  contextSlot,
  detailSlot,
  layout,
  mainSlot,
  onActivityChange,
  problemsSlot,
  statusBarSlot,
}: {
  activeActivityId: ActivityId;
  activityItems: readonly ActivityNavigationItem[];
  contextSlot: ActivityContextSlot | null;
  detailSlot: ActivityRegionSlot | null;
  layout: WorkbenchLayout;
  mainSlot: ActivityRegionSlot;
  onActivityChange: (activityId: ActivityId) => void;
  problemsSlot: ReactNode;
  statusBarSlot: ReactNode;
}) {
  const {
    contextCollapsed,
    contextResizeValue,
    contextWidth,
    detailCollapsed,
    detailResizeValue,
    detailWidth,
    focusMode,
    isContextResizing,
    isDetailResizing,
    isProblemsResizing,
    onContextResizeKeyDown,
    onContextResizeStart,
    onDetailResizeKeyDown,
    onDetailResizeStart,
    onDetailToggle,
    onProblemsResizeKeyDown,
    onProblemsResizeStart,
    problemsExpanded,
    problemsHeight,
    problemsResizeValue,
  } = layout;
  const hasContext = contextSlot !== null && !focusMode;
  const showContext = hasContext && !contextCollapsed;
  const hasDetail = detailSlot !== null && !focusMode;
  const showProblems = !focusMode;
  const frameClassName = cx(
    "app-frame",
    focusMode && "is-focus-mode",
    showContext ? "has-context" : "no-context",
    hasDetail ? "has-detail" : "no-detail",
    detailCollapsed && hasDetail && "detail-collapsed",
    isContextResizing && "is-resizing-context",
    isDetailResizing && "is-resizing-detail",
    isProblemsResizing && "is-resizing-problems",
    showProblems && "has-problems",
    showProblems && problemsExpanded && "problems-expanded",
  );
  const style: AppFrameStyle = {
    ...(contextWidth === null
      ? {}
      : { "--app-context-width": `${contextWidth}px` }),
    ...(detailWidth === null
      ? {}
      : { "--app-detail-width": `${detailWidth}px` }),
    "--app-problems-height": `${problemsHeight}px`,
  };

  return (
    <main className={cx(frameClassName)} style={style}>
      <ActivityBar
        activities={activityItems}
        activeActivityId={activeActivityId}
        onActivityChange={onActivityChange}
      />
      {showContext ? (
        <aside className={cx("app-context")} aria-label={contextSlot.title}>
          <RegionFrame slot={contextSlot} position="context" />
          <div
            aria-label="调整上下文区宽度"
            aria-orientation="vertical"
            aria-valuemax={appContextMaxWidth}
            aria-valuemin={appContextMinWidth}
            aria-valuenow={contextResizeValue}
            aria-valuetext={`${contextResizeValue}px`}
            className={cx("app-resize-handle app-context-resize")}
            onKeyDown={onContextResizeKeyDown}
            onPointerDown={onContextResizeStart}
            role="separator"
            tabIndex={0}
          />
        </aside>
      ) : null}
      <section className={cx("app-main-region")}>
        <div className={cx("app-main-content")}>
          <RegionFrame slot={mainSlot} position="main" />
        </div>
        <aside
          aria-label="问题"
          hidden={!showProblems || !problemsExpanded}
          id="workbench-problems"
          className={cx(
            problemsExpanded ? "app-problems is-expanded" : "app-problems",
          )}
        >
          {problemsExpanded ? (
            <div
              aria-label="调整问题面板高度"
              aria-orientation="horizontal"
              aria-valuemax={appProblemsMaxHeight}
              aria-valuemin={appProblemsMinHeight}
              aria-valuenow={problemsResizeValue}
              aria-valuetext={`${problemsResizeValue}px`}
              className={cx("app-resize-handle app-problems-resize")}
              onKeyDown={onProblemsResizeKeyDown}
              onPointerDown={onProblemsResizeStart}
              role="separator"
              tabIndex={0}
            />
          ) : null}
          {problemsSlot}
        </aside>
      </section>
      {hasDetail ? (
        <aside
          className={cx(
            detailCollapsed ? "app-detail app-detail-collapsed" : "app-detail",
          )}
        >
          {detailCollapsed ? (
            <header className={cx("app-detail-collapsed-header")}>
              <Button
                aria-label="展开右侧详情"
                className={cx("app-detail-toggle")}
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
                className={cx("app-resize-handle app-detail-resize")}
                onKeyDown={onDetailResizeKeyDown}
                onPointerDown={onDetailResizeStart}
                role="separator"
                tabIndex={0}
              />
              <RegionFrame
                slot={detailSlot!}
                position="detail"
                onCollapse={onDetailToggle}
              />
            </>
          )}
        </aside>
      ) : null}
      {!focusMode ? statusBarSlot : null}
    </main>
  );
}
