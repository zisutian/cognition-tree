import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { WorkbenchDiagnostics } from "../../../application/workbench/problems/workbenchProblems";
import type { SyntaxFocusTarget } from "../../../application/syntax/syntaxProjection";
import type { WorkbenchApplication } from "../../activities/workbenchApplication";
import {
  activityDescriptors,
  getActivityLabel,
} from "../../activities/activityCatalog";
import AppView from "../../ui/AppView";
import { PlaceholderPanel } from "./PlaceholderPanel";
import type { ActivityId } from "../../ui/activityTypes";
import {
  FeedbackProvider,
  type WorkbenchActivityFeedbackController,
} from "../../ui/shared/FeedbackProvider";
import { useWorkbenchLayout } from "../../ui/workbench/useWorkbenchLayout";
import type { RenderActivity } from "../../activities/activityController";
import { WorkbenchProblemsController } from "./WorkbenchProblemsController";
import { canChangeActivityWithSyntaxDraft } from "./syntaxNavigationGuard";

function ActivityLoadingView({
  activeActivityId,
  renderActivity,
}: {
  activeActivityId: ActivityId;
  renderActivity: RenderActivity;
}) {
  const label = getActivityLabel(activeActivityId);

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
      new Set<ActivityId>([activeActivityId]),
  );
  const [syntaxLeaveBlocked, setSyntaxLeaveBlocked] = useState(false);
  const [syntaxProblems, setSyntaxProblems] =
    useState<WorkbenchDiagnostics | null>(null);
  const [systemSyntaxFocusRequest, setSystemSyntaxFocusRequest] = useState<
    Extract<SyntaxFocusTarget, { systemOwner: "journal" | "todo" }> | null
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
  ) => {
    setSyntaxProblems(diagnostics);
  }, []);

  useEffect(() => {
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
              {activityDescriptors.map(({ id, Controller }) => {
                const active = activeActivityId === id;

                return active || retainedActivityIds.has(id) ? (
                  <Suspense
                    fallback={
                      active ? (
                        <ActivityLoadingView
                          activeActivityId={id}
                          renderActivity={renderActivity}
                        />
                      ) : null
                    }
                    key={id}
                  >
                    <Controller {...controllerProps} active={active} />
                  </Suspense>
                ) : null;
              })}
            </>
          );
        }}
      </WorkbenchProblemsController>
    </FeedbackProvider>
  );
}
