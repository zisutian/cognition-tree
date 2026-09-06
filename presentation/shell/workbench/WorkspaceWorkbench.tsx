import type { ActivityInteractionState } from "../../ui/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { WorkbenchDiagnostics } from "../../../application/workbench/index.ts";
import type { SyntaxFocusTarget } from "../../../application/syntax/index.ts";
import type { WorkbenchApplication } from "../application/workbenchApplication.ts";
import { activityDescriptors, getActivityLabel } from "./activityCatalog.tsx";
import type { RenderActivity, ActivityId } from "../../ui/index.ts";
import AppView from "../../ui/index.ts";

import {
  FeedbackProvider,
  type WorkbenchActivityFeedbackController,
  globalWorkbenchSessionId,
  useWorkbenchLayout,
} from "../../ui/index.ts";

import { PlaceholderPanel } from "./PlaceholderPanel.tsx";
import { WorkbenchProblemsController } from "./WorkbenchProblemsController.tsx";

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
  interaction,
  onInteractionStateChange,
  application,
  feedbackController,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  interaction: ActivityInteractionState;
  onInteractionStateChange(
    activityId: ActivityId,
    state: ActivityInteractionState,
  ): void;
  application: WorkbenchApplication;
  feedbackController: WorkbenchActivityFeedbackController;
  onActiveActivityChange: (
    activityId: ActivityId,
    beforeChange?: () => boolean | void,
  ) => void;
}) {
  const workbench = useWorkbenchLayout(
    application.repository.activeDescriptor?.id ?? globalWorkbenchSessionId,
  );
  const [retainedActivityIds, setRetainedActivityIds] = useState(
    () => new Set<ActivityId>([activeActivityId]),
  );
  const setSyntaxLeaveBlocked = useCallback(
    (blocked: boolean) =>
      onInteractionStateChange("syntax", {
        navigationBlocked: blocked,
        statusMessage: blocked ? "语法包含未解决的问题，请先处理后再切换" : "",
      }),
    [onInteractionStateChange],
  );
  const [syntaxProblems, setSyntaxProblems] =
    useState<WorkbenchDiagnostics | null>(null);
  const [systemSyntaxFocusRequest, setSystemSyntaxFocusRequest] =
    useState<Extract<
      SyntaxFocusTarget,
      { systemOwner: "journal" | "todo" }
    > | null>(null);
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
      current?.requestId === requestId ? null : current,
    );
  };
  const requestActivityChange = onActiveActivityChange;
  const updateSyntaxProblems = useCallback(
    (diagnostics: WorkbenchDiagnostics | null) => {
      setSyntaxProblems(diagnostics);
    },
    [],
  );

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
        statusMessage={interaction.statusMessage}
        syntaxDiagnostics={syntaxProblems}
        workbench={workbench}
      >
        {({ problemsSlot, statusBarSlot }) => {
          const renderActivity: RenderActivity = (createActivitySlots) => (
            <AppView
              activityItems={activityDescriptors}
              activeActivityId={activeActivityId}
              createActivitySlots={createActivitySlots}
              onActiveActivityChange={requestActivityChange}
              problemsSlot={problemsSlot}
              statusBarSlot={statusBarSlot}
              workbench={workbench}
            />
          );
          const controllerProps = {
            application,
            onActiveActivityChange: requestActivityChange,
            onInteractionStateChange,
            onConsumeSystemSyntaxFocusRequest: consumeSystemSyntaxFocusRequest,
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
