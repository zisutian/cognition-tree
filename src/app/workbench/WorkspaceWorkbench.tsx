import { Suspense, useEffect, useState } from "react";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import { activityItems } from "../../ui/ActivityBar";
import AppView from "../../ui/AppView";
import { PlaceholderPanel } from "../../ui/activities/PlaceholderPanel";
import type { ActivityId } from "../../ui/activityTypes";
import { FeedbackProvider } from "../../ui/shared/FeedbackProvider";
import { useWorkbenchLayout } from "../../ui/workbench/useWorkbenchLayout";
import { PlaceholderActivityController } from "../activities/PlaceholderActivityController";
import {
  isLazyActivityId,
  workspaceActivityControllers,
  type LazyActivityId,
} from "../activities/activityRegistry";
import type { RenderWorkspaceActivity } from "../activities/activityController";
import { WorkspacePersistenceNotification } from "./WorkspacePersistenceNotification";
import { WorkbenchProblemsController } from "./WorkbenchProblemsController";

function ActivityLoadingView({
  activeActivityId,
  renderActivity,
}: {
  activeActivityId: LazyActivityId;
  renderActivity: RenderWorkspaceActivity;
}) {
  const label =
    activityItems.find((item) => item.id === activeActivityId)?.label ?? "活动";

  return renderActivity(() => ({
    context: null,
    detail: null,
    main: (
      <PlaceholderPanel
        description="正在载入活动模块。"
        title={`正在加载${label}`}
      />
    ),
  }));
}

export function WorkspaceWorkbench({
  activeActivityId,
  application,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  application: WorkspaceApplication;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const workbench = useWorkbenchLayout(
    application.repository.activeRepositoryId,
  );
  const [retainedActivityIds, setRetainedActivityIds] = useState(
    () =>
      new Set<LazyActivityId>(
        isLazyActivityId(activeActivityId) ? [activeActivityId] : [],
      ),
  );

  useEffect(() => {
    if (!isLazyActivityId(activeActivityId)) {
      return;
    }

    setRetainedActivityIds((current) => {
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
      <WorkspacePersistenceNotification
        persistence={application.repository.persistence}
      />
      <WorkbenchProblemsController
        application={application}
        onActiveActivityChange={onActiveActivityChange}
        workbench={workbench}
      >
        {(problemsSlot) => {
          const renderActivity: RenderWorkspaceActivity = (
            createActivitySlots,
          ) => (
            <AppView
              activeActivityId={activeActivityId}
              createActivitySlots={createActivitySlots}
              onActiveActivityChange={onActiveActivityChange}
              problemsSlot={problemsSlot}
              workbench={workbench}
            />
          );
          const controllerProps = { application, renderActivity };

          return (
            <>
              {workspaceActivityControllers.map(({ activityId, Controller }) => {
                const active = activeActivityId === activityId;

                return active || retainedActivityIds.has(activityId) ? (
                  <Suspense
                    fallback={
                      active ? (
                        <ActivityLoadingView
                          activeActivityId={activityId}
                          renderActivity={renderActivity}
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
                  renderActivity={renderActivity}
                />
              ) : null}
            </>
          );
        }}
      </WorkbenchProblemsController>
    </FeedbackProvider>
  );
}
