import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createProblemCenter } from "../../application/problems/problemCenter";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
} from "../../application/system";
import { projectWorkspaceSessionApplication } from "../../application/workspace/session/workspaceSessionApplication";
import type { OfficialClientApi } from "../../infrastructure/client/http/apiTransport";
import { createClientAgentRuntime } from "../../infrastructure/client/runtime/agentRuntime";
import {
  createClientSystemConfigurationRuntime,
} from "../../infrastructure/client/runtime/systemRuntime";
import { createWorkbenchRuntime } from "../../infrastructure/client/runtime/workbenchRuntime";
import { clientApplicationScheduler } from "../../infrastructure/client/platform/applicationServices";
import type { ActivityId } from "../ui/activityTypes";
import { useWorkbenchApplicationBindings } from "./application/useWorkbenchApplicationBindings";
import { projectUnavailableWorkspace } from "./application/workbenchApplicationProjection";
import { ReadyWorkspaceWorkbench } from "./workbench/ReadyWorkspaceWorkbench";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

export function AuthenticatedWorkbenchRoot({
  api,
  authenticationController,
  authenticationState,
}: {
  api: OfficialClientApi;
  authenticationController: OwnerAuthenticationController;
  authenticationState: OwnerAuthenticationState;
}) {
  const controller = useMemo(() => createWorkbenchRuntime(api), [api]);
  const feedbackController = useMemo(
    () => createProblemCenter<ActivityId>({
      scheduler: clientApplicationScheduler,
    }),
    [],
  );
  const agentRuntime = useMemo(() => createClientAgentRuntime(
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
    feedbackController,
  ), [api, controller, feedbackController]);
  const systemConfigurationController = useMemo(
    () => createClientSystemConfigurationRuntime(
      api,
      controller.flushLoadedContent,
    ),
    [api, controller],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const agentSnapshot = useSyncExternalStore(
    agentRuntime.session.subscribe,
    agentRuntime.session.getSnapshot,
    agentRuntime.session.getSnapshot,
  );
  const agentConfigurationSnapshot = useSyncExternalStore(
    agentRuntime.configuration.subscribe,
    agentRuntime.configuration.getSnapshot,
    agentRuntime.configuration.getSnapshot,
  );
  const systemConfigurationSnapshot = useSyncExternalStore(
    systemConfigurationController.subscribe,
    systemConfigurationController.getSnapshot,
    systemConfigurationController.getSnapshot,
  );
  const lifecycleEpochRef = useRef(0);
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const applications = useWorkbenchApplicationBindings({
    agentConfigurationController: agentRuntime.configuration,
    agentConfigurationState: agentConfigurationSnapshot,
    agentController: agentRuntime.session,
    agentState: agentSnapshot,
    controller,
    feedbackController,
    snapshot,
    systemAuthenticationController: authenticationController,
    systemAuthenticationState: authenticationState,
    systemConfigurationController,
    systemConfigurationState: systemConfigurationSnapshot,
  });

  useEffect(() => {
    const lifecycleEpoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = lifecycleEpoch;
    controller.start();
    agentRuntime.session.start();
    void agentRuntime.configuration.load();
    void systemConfigurationController.load();
    return () => {
      queueMicrotask(() => {
        if (lifecycleEpochRef.current === lifecycleEpoch) {
          controller.dispose();
          agentRuntime.session.dispose();
          feedbackController.dispose();
        }
      });
    };
  }, [
    agentRuntime,
    controller,
    feedbackController,
    systemConfigurationController,
  ]);

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
        operations={applications.operations}
        repository={applications.repository}
        search={applications.search}
        session={session}
        snapshot={snapshot}
        system={applications.system}
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
