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
import { createClientAgentRuntime } from "../../infrastructure/client/runtime/agentRuntime";
import type { ActivityId } from "../ui/activityTypes";
import { useWorkbenchApplicationBindings } from "./application/useWorkbenchApplicationBindings";
import { projectUnavailableWorkspace } from "./application/workbenchApplicationProjection";
import { ReadyWorkspaceWorkbench } from "./workbench/ReadyWorkspaceWorkbench";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

export function AppRoot({
  api,
}: {
  api: ClientApiConfiguration;
}) {
  const controller = useMemo(() => createWorkbenchRuntime(api), [api]);
  const agentController = useMemo(() => createClientAgentRuntime(
    api,
    async (scope) => {
      const current = controller.getSnapshot();

      if (scope.domain === "workspace") {
        if (current.catalog.activeDescriptor?.id !== scope.repositoryId) return;
        if (current.workspace.status !== "ready") {
          throw new Error("Workspace draft is not ready to synchronize.");
        }
        await controller.workspace.synchronizePendingChanges();
        return;
      }
      if (scope.domain === "journal") {
        if (current.builtIns.journal.state.status !== "ready") return;
        await controller.journal.synchronizePendingChanges();
        return;
      }
      if (current.builtIns.todo.state.status !== "ready") return;
      await controller.todo.synchronizePendingChanges();
    },
  ), [api, controller]);
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
  const agentSnapshot = useSyncExternalStore(
    agentController.subscribe,
    agentController.getSnapshot,
    agentController.getSnapshot,
  );
  const lifecycleEpochRef = useRef(0);
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const applications = useWorkbenchApplicationBindings({
    agentController,
    agentState: agentSnapshot,
    controller,
    feedbackController,
    snapshot,
  });

  useEffect(() => {
    const lifecycleEpoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = lifecycleEpoch;
    controller.start();
    agentController.start();
    return () => {
      queueMicrotask(() => {
        if (lifecycleEpochRef.current === lifecycleEpoch) {
          controller.dispose();
          agentController.dispose();
          feedbackController.dispose();
        }
      });
    };
  }, [agentController, controller, feedbackController]);

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
        agent={applications.agent}
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
