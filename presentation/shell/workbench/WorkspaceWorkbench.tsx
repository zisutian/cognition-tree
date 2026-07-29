import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { WorkbenchDiagnostics } from "../../../application/problems/workbenchProblems";
import type { UiSyntaxFocusTarget } from "../../../application/workspace/projection/viewSyntax";
import type { WorkbenchApplication } from "../../activities/workbenchApplication";
import { activityItems } from "../../ui/activityCatalog";
import AppView from "../../ui/AppView";
import { PlaceholderPanel } from "../../activities/views/PlaceholderPanel";
import type { ActivityId } from "../../ui/activityTypes";
import {
  FeedbackProvider,
  type WorkbenchActivityFeedbackController,
} from "../../ui/shared/FeedbackProvider";
import { useWorkbenchLayout } from "../../ui/workbench/useWorkbenchLayout";
import { PlaceholderActivityController } from "../../activities/controllers/PlaceholderActivityController";
import {
  isLazyActivityId,
  activityControllers,
  type LazyActivityId,
} from "../../activities/controllers/activityRegistry";
import type { RenderActivity } from "../../activities/controllers/activityController";
import { WorkbenchProblemsController } from "./WorkbenchProblemsController";
import { canChangeActivityWithSyntaxDraft } from "./syntaxNavigationGuard";

function ActivityLoadingView({
  activeActivityId,
  renderActivity,
}: {
  activeActivityId: LazyActivityId;
  renderActivity: RenderActivity;
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
  feedbackController,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  application: WorkbenchApplication;
  feedbackController: WorkbenchActivityFeedbackController;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const workbench = useWorkbenchLayout(
    application.repository.activeDescriptor?.id ?? "workbench-global",
  );
  const [retainedActivityIds, setRetainedActivityIds] = useState(
    () =>
      new Set<LazyActivityId>(
        isLazyActivityId(activeActivityId) ? [activeActivityId] : [],
      ),
  );
  const [syntaxLeaveBlocked, setSyntaxLeaveBlocked] = useState(false);
  const [syntaxProblems, setSyntaxProblems] =
    useState<WorkbenchDiagnostics | null>(null);
  const [syntaxProblemOwner, setSyntaxProblemOwner] = useState<
    "journal" | "todo" | "workspace"
  >("workspace");
  const [systemSyntaxFocusRequest, setSystemSyntaxFocusRequest] = useState<
    Extract<UiSyntaxFocusTarget, { systemOwner: "journal" | "todo" }> | null
  >(null);
  const nextSystemSyntaxFocusRequestIdRef = useRef(1);
  const openSystemSyntax = (
    systemOwner: "journal" | "todo",
    fieldId: string,
  ) => {
    setSystemSyntaxFocusRequest({
      fieldId,
      requestId: nextSystemSyntaxFocusRequestIdRef.current++,
      systemOwner,
    });
  };
  const consumeSystemSyntaxFocusRequest = (requestId: number) => {
    setSystemSyntaxFocusRequest((current) =>
      current?.requestId === requestId ? null : current
    );
  };
  const requestActivityChange = (activityId: ActivityId) => {
    if (!canChangeActivityWithSyntaxDraft({
      activeActivityId,
      nextActivityId: activityId,
      syntaxLeaveBlocked,
    })) {
      return;
    }
    onActiveActivityChange(activityId);
  };
  const updateSyntaxProblems = useCallback((
    diagnostics: WorkbenchDiagnostics | null,
    owner: "journal" | "todo" | "workspace",
  ) => {
    setSyntaxProblems(diagnostics);
    setSyntaxProblemOwner(owner);
  }, []);

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
    <FeedbackProvider
      activeActivityId={activeActivityId}
      controller={feedbackController}
    >
      <WorkbenchProblemsController
        activeActivityId={activeActivityId}
        application={application}
        onOpenSystemSyntax={openSystemSyntax}
        onActiveActivityChange={requestActivityChange}
        syntaxDiagnostics={syntaxProblems}
        syntaxOwner={syntaxProblemOwner}
        workbench={workbench}
      >
        {(problemsSlot) => {
          const renderActivity: RenderActivity = (
            createActivitySlots,
          ) => (
            <AppView
              activeActivityId={activeActivityId}
              createActivitySlots={createActivitySlots}
              onActiveActivityChange={requestActivityChange}
              problemsSlot={problemsSlot}
              workbench={workbench}
            />
          );
          const controllerProps = {
            application,
            onActiveActivityChange: requestActivityChange,
            onConsumeSystemSyntaxFocusRequest:
              consumeSystemSyntaxFocusRequest,
            onSyntaxLeaveBlockedChange: setSyntaxLeaveBlocked,
            onSyntaxProblemsChange: updateSyntaxProblems,
            renderActivity,
            systemSyntaxFocusRequest,
          };

          return (
            <>
              {activityControllers.map(({ activityId, Controller }) => {
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
              {activeActivityId === "data" ? (
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
