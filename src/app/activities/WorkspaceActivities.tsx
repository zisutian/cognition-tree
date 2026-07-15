import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import { activityItems } from "../../ui/ActivityBar";
import AppView from "../../ui/AppView";
import { PlaceholderPanel } from "../../ui/activities/PlaceholderPanel";
import type { ActivityId } from "../../ui/activityTypes";
import { FeedbackProvider } from "../../ui/shared/FeedbackProvider";
import {
  useWorkbenchLayout,
  type WorkbenchController,
} from "../../ui/useWorkbenchLayout";
import { PlaceholderActivityController } from "./PlaceholderActivityController";
import type { WorkspaceActivityControllerProps } from "./activityController";

type LazyActivityId = Exclude<ActivityId, "data" | "search">;
type LazyActivityController = LazyExoticComponent<
  ComponentType<WorkspaceActivityControllerProps>
>;

const lazyActivityControllers: ReadonlyArray<{
  activityId: LazyActivityId;
  Controller: LazyActivityController;
}> = [
  {
    activityId: "notes",
    Controller: lazy(async () => ({
      default: (await import("./NotesActivityController"))
        .NotesActivityController,
    })),
  },
  {
    activityId: "structure-operation",
    Controller: lazy(async () => ({
      default: (await import("./StructureOperationActivityController"))
        .StructureOperationActivityController,
    })),
  },
  {
    activityId: "visualization",
    Controller: lazy(async () => ({
      default: (await import("./VisualizationActivityController"))
        .VisualizationActivityController,
    })),
  },
  {
    activityId: "syntax",
    Controller: lazy(async () => ({
      default: (await import("./SyntaxActivityController"))
        .SyntaxActivityController,
    })),
  },
  {
    activityId: "settings",
    Controller: lazy(async () => ({
      default: (await import("./SettingsActivityController"))
        .SettingsActivityController,
    })),
  },
];

function isLazyActivityId(activityId: ActivityId): activityId is LazyActivityId {
  return lazyActivityControllers.some(
    (controller) => controller.activityId === activityId,
  );
}

function ActivityLoadingView({
  activeActivityId,
  onActiveActivityChange,
  workbench,
}: {
  activeActivityId: LazyActivityId;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
}) {
  const label =
    activityItems.find((item) => item.id === activeActivityId)?.label ?? "活动";

  return (
    <AppView
      activeActivityId={activeActivityId}
      createActivitySlots={() => ({
        context: null,
        detail: null,
        main: (
          <PlaceholderPanel
            description="正在载入活动模块。"
            title={`正在加载${label}`}
          />
        ),
      })}
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  );
}

export function WorkspaceActivities({
  activeActivityId,
  application,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  application: WorkspaceApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const workbench = useWorkbenchLayout();
  const [mountedActivityIds, setMountedActivityIds] = useState(
    () =>
      new Set<LazyActivityId>(
        isLazyActivityId(activeActivityId) ? [activeActivityId] : [],
      ),
  );
  const controllerProps = {
    application,
    onActiveActivityChange,
    workbench,
  };

  useEffect(() => {
    if (!isLazyActivityId(activeActivityId)) {
      return;
    }

    setMountedActivityIds((current) => {
      if (current.has(activeActivityId)) {
        return current;
      }

      const next = new Set(current);
      next.add(activeActivityId);
      return next;
    });
  }, [activeActivityId]);

  return (
    <FeedbackProvider>
      {lazyActivityControllers.map(({ activityId, Controller }) => {
        const active = activeActivityId === activityId;

        return active || mountedActivityIds.has(activityId) ? (
          <Suspense
            fallback={
              active ? (
                <ActivityLoadingView
                  activeActivityId={activityId}
                  onActiveActivityChange={onActiveActivityChange}
                  workbench={workbench}
                />
              ) : null
            }
            key={activityId}
          >
            <Controller {...controllerProps} active={active} />
          </Suspense>
        ) : null;
      })}
      {activeActivityId === "search" || activeActivityId === "data" ? (
        <PlaceholderActivityController
          activityId={activeActivityId}
          onActiveActivityChange={onActiveActivityChange}
          workbench={workbench}
        />
      ) : null}
    </FeedbackProvider>
  );
}
