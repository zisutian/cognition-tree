import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createWorkbenchFeedbackController } from "../../application/workbench/workbenchFeedbackController";
import { projectWorkspaceSessionApplication } from "../../application/workspace/session/workspaceSessionApplication";
import type {
  ClientApiConfiguration,
} from "../../infrastructure/client/runtime/apiConfiguration";
import { clientApplicationScheduler } from "../../infrastructure/client/platform/applicationServices";
import { createWorkbenchRuntime } from "../../infrastructure/client/runtime/workbenchRuntime";
import type { ActivityId } from "../ui/activityTypes";
import { useWorkbenchApplicationBindings } from "./bindings/application/workbench/useWorkbenchApplicationBindings";
import { projectUnavailableWorkspace } from "./bindings/application/workbench/workbenchApplicationProjection";
import { ReadyWorkspaceWorkbench } from "./workbench/ReadyWorkspaceWorkbench";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

export function AppRoot({
  api,
}: {
  api: ClientApiConfiguration;
}) {
  const controller = useMemo(() => createWorkbenchRuntime(api), [api]);
  const feedbackController = useMemo(
    () => createWorkbenchFeedbackController<ActivityId>({
      scheduler: clientApplicationScheduler,
    }),
    [],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const lifecycleEpochRef = useRef(0);
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const applications = useWorkbenchApplicationBindings({
    controller,
    feedbackController,
    snapshot,
  });

  useEffect(() => {
    const lifecycleEpoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = lifecycleEpoch;
    controller.start();
    return () => {
      queueMicrotask(() => {
        if (lifecycleEpochRef.current === lifecycleEpoch) {
          controller.dispose();
          feedbackController.dispose();
        }
      });
    };
  }, [controller, feedbackController]);

  if (snapshot.workspace.status === "ready") {
    const session = projectWorkspaceSessionApplication(
      controller.workspace,
      snapshot.workspace,
    );

    if (session.status !== "ready") {
      throw new Error("Ready Workspace projection lost its ready state.");
    }
    return (
      <ReadyWorkspaceWorkbench
        activeActivityId={activeActivityId}
        apiAccess={applications.apiAccess}
        controller={controller}
        feedbackController={feedbackController}
        journal={applications.journal}
        key={snapshot.catalog.activeDescriptor?.id}
        onActiveActivityChange={setActiveActivityId}
        repository={applications.repository}
        search={applications.search}
        session={session}
        snapshot={snapshot}
        todo={applications.todo}
      />
    );
  }
  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        ...applications,
        workspace: projectUnavailableWorkspace(controller, snapshot),
      }}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}
