import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createWorkbenchFeedbackController } from "../../application/workbench/workbenchFeedbackController";
import { projectWorkspaceSessionApplication } from "../../application/workspace/session/workspaceSessionApplication";
import { clientApplicationScheduler } from "../../infrastructure/client/platform/applicationServices";
import { createWorkbenchRuntime } from "../../infrastructure/client/runtime/workbenchRuntime";
import { createClientAgentRuntime } from "../../infrastructure/client/runtime/agentRuntime";
import { createClientSystemRuntime } from "../../infrastructure/client/runtime/systemRuntime";
import type { ActivityId } from "../ui/activityTypes";
import { useWorkbenchApplicationBindings } from "./application/useWorkbenchApplicationBindings";
import { projectUnavailableWorkspace } from "./application/workbenchApplicationProjection";
import { ReadyWorkspaceWorkbench } from "./workbench/ReadyWorkspaceWorkbench";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";
import { OwnerLogin } from "./OwnerLogin";

export function AppRoot() {
  const api = useMemo(() => ({ baseUrl: globalThis.location.origin }), []);
  const controller = useMemo(() => createWorkbenchRuntime(api), [api]);
  const systemRuntime = useMemo(() => createClientSystemRuntime(
    api,
    controller.flushLoadedContent,
  ), [api, controller]);
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
  ), [api, controller]);
  const agentController = agentRuntime.session;
  const agentConfigurationController = agentRuntime.configuration;
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
  const agentConfigurationSnapshot = useSyncExternalStore(
    agentConfigurationController.subscribe,
    agentConfigurationController.getSnapshot,
    agentConfigurationController.getSnapshot,
  );
  const systemAuthenticationSnapshot = useSyncExternalStore(
    systemRuntime.authentication.subscribe,
    systemRuntime.authentication.getSnapshot,
    systemRuntime.authentication.getSnapshot,
  );
  const systemConfigurationSnapshot = useSyncExternalStore(
    systemRuntime.configuration.subscribe,
    systemRuntime.configuration.getSnapshot,
    systemRuntime.configuration.getSnapshot,
  );
  const lifecycleEpochRef = useRef(0);
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const applications = useWorkbenchApplicationBindings({
    agentConfigurationController,
    agentConfigurationState: agentConfigurationSnapshot,
    agentController,
    agentState: agentSnapshot,
    controller,
    feedbackController,
    snapshot,
    systemAuthenticationController: systemRuntime.authentication,
    systemAuthenticationState: systemAuthenticationSnapshot,
    systemConfigurationController: systemRuntime.configuration,
    systemConfigurationState: systemConfigurationSnapshot,
  });

  useEffect(() => {
    void systemRuntime.authentication.load();
  }, [systemRuntime]);

  useEffect(() => {
    if (!systemAuthenticationSnapshot.authenticated) return;
    const lifecycleEpoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = lifecycleEpoch;
    controller.start();
    agentController.start();
    void agentConfigurationController.load();
    void systemRuntime.configuration.load();
    return () => {
      queueMicrotask(() => {
        if (lifecycleEpochRef.current === lifecycleEpoch) {
          controller.dispose();
          agentController.dispose();
          feedbackController.dispose();
        }
      });
    };
  }, [
    agentConfigurationController,
    agentController,
    controller,
    feedbackController,
    systemAuthenticationSnapshot.authenticated,
    systemRuntime,
  ]);

  if (!systemAuthenticationSnapshot.authenticated) {
    return (
      <OwnerLogin
        controller={systemRuntime.authentication}
        state={systemAuthenticationSnapshot}
      />
    );
  }

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
