import { usePageNavigation } from "../navigation/index.ts";
import { Workbench, type WorkbenchRegion } from "compact-ui";
import { PageTitleGroup, EmptyState } from "compact-ui";
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ActivityId,
  ActivityNavigationItem,
  ActivityRegionSlot,
  CreateActivitySlots,
} from "./activityTypes.ts";
import {
  PageActionsHostContext,
  PageLayoutContext,
} from "./shared/PageLayout.ts";
import { useWorkbenchFocusShortcuts } from "./workbench/useWorkbenchFocusShortcuts.ts";
import type { WorkbenchController } from "./workbench/useWorkbenchLayout.ts";
import "./styles/index.css";

function useRegion(
  slot: ActivityRegionSlot | null,
): WorkbenchRegion | undefined {
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  if (!slot) return undefined;
  const { fixedPageActions, ...region } = slot;
  const layout =
    slot.layout === "form"
      ? "form"
      : slot.layout === "detail"
        ? "detail"
        : "fill";
  return {
    ...region,
    layout,
    footer: fixedPageActions ? <div ref={setActionsHost} /> : slot.footer,
    content: (
      <PageLayoutContext value={slot.layout ?? "canvas"}>
        <PageActionsHostContext value={fixedPageActions ? actionsHost : null}>
          {slot.content}
        </PageActionsHostContext>
      </PageLayoutContext>
    ),
  };
}
export default function AppView({
  activeActivityId,
  activityItems,
  createActivitySlots,
  onActiveActivityChange,
  onProblemsClosed,
  problemsSlot,
  statusBarSlot,
  workbench,
}: {
  activeActivityId: ActivityId;
  activityItems: readonly ActivityNavigationItem[];
  createActivitySlots: CreateActivitySlots;
  onActiveActivityChange(
    activity: ActivityId,
    beforeChange?: () => boolean | void,
  ): void;
  problemsSlot: ReactNode;
  onProblemsClosed(): void;
  statusBarSlot: { start: ReactNode; end: ReactNode };
  workbench: WorkbenchController;
}) {
  const navigation = usePageNavigation();
  const pageState = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
  );
  const emptyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!pageState.activePageId) emptyRef.current?.focus();
  }, [pageState.activePageId]);
  const slots = createActivitySlots({
    contextWidth: workbench.layout.contextWidth,
    focusMode: workbench.layout.focusMode,
    onConfigureSyntax: () =>
      onActiveActivityChange("syntax", workbench.expandPanels),
    onContextWidthChange: workbench.setContextWidth,
    onToggleFocusMode: workbench.toggleFocusMode,
  });
  useWorkbenchFocusShortcuts({
    enabled: activeActivityId === "notes",
    focusMode: workbench.layout.focusMode,
    onExitFocusMode: workbench.exitFocusMode,
    onToggleFocusMode: workbench.toggleFocusMode,
  });
  const contextRegion = useRegion(slots.context);
  const mainRegion = useRegion(slots.main);
  const detailRegion = useRegion(slots.detail);
  return (
    <Workbench
      activities={activityItems.map(({ icon: Icon, ...item }) => ({
        ...item,
        icon: <Icon />,
      }))}
      activeActivityId={activeActivityId}
      onActivityRequest={(id, intent) =>
        navigation.request(id as ActivityId, workbench.expandContext, intent)
      }
      context={workbench.layout.contextCollapsed ? undefined : contextRegion}
      main={
        pageState.activePageId
          ? {
              ...mainRegion!,
              headerContent: (
                <PageTitleGroup
                  aria-label="打开的页面"
                  value={pageState.activePageId}
                  options={navigation.visiblePages().map((page) => ({
                    value: page.key,
                    label: page.title,
                    preview: page.key === pageState.previewId,
                    closeLabel: `关闭 ${page.title}`,
                  }))}
                  onChange={navigation.activate}
                  onClose={navigation.close}
                />
              ),
            }
          : {
              title: "工作区",
              layout: "fill",
              content: (
                <div tabIndex={-1} ref={emptyRef}>
                  <EmptyState title="从左侧打开页面" />
                </div>
              ),
            }
      }
      detail={pageState.activePageId ? detailRegion : undefined}
      bottom={
        workbench.layout.bottomExpanded
          ? { title: "问题", layout: "fill", content: problemsSlot }
          : undefined
      }
      status={statusBarSlot}
      layout={workbench.layout}
      onLayoutChange={(layout) => {
        if (workbench.layout.bottomExpanded && !layout.bottomExpanded)
          onProblemsClosed();
        workbench.onLayoutChange(layout);
      }}
    />
  );
}
