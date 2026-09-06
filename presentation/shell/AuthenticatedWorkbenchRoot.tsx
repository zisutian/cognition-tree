// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createProblemCenter } from "../../application/problems/index.ts";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
} from "../../application/system/index.ts";
import { projectWorkspaceSessionApplication } from "../../application/workspace/index.ts";
import type { OfficialClientApi } from "../../infrastructure/client/http/index.ts";
import {
  createClientAgentRuntime,
  createClientSystemConfigurationRuntime,
  createWorkbenchRuntime,
} from "../../infrastructure/client/runtime/index.ts";


import { clientApplicationScheduler } from "../../infrastructure/client/platform/index.ts";
import type { ActivityId } from "../ui/index.ts";
import {
  RepositorySessionStateProvider,
} from "../ui/index.ts";
import { useWorkbenchApplicationBindings } from "./application/useWorkbenchApplicationBindings.ts";
import { projectUnavailableWorkspace } from "./application/workbenchApplicationProjection.ts";
import { ReadyWorkspaceWorkbench } from "./workbench/ReadyWorkspaceWorkbench.tsx";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench.tsx";

export function AuthenticatedWorkbenchRoot({
  api,
  authenticationController,
  authenticationState,
}: {
  api: OfficialClientApi;
  authenticationController: OwnerAuthenticationController;
  authenticationState: OwnerAuthenticationState;
}) {
  const workbenchRuntime = useMemo(() => createWorkbenchRuntime(api), [api]);
  const controller = workbenchRuntime.controller;
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
    applicationServices: workbenchRuntime.applicationServices,
    agentConfigurationController: agentRuntime.configuration,
    agentConfigurationState: agentConfigurationSnapshot,
    agentController: agentRuntime.session,
    agentState: agentSnapshot,
    apiAccessAdministration: workbenchRuntime.apiAccessAdministration,
    controller,
    feedbackController,
    operationAdministration: workbenchRuntime.operationAdministration,
    snapshot,
    systemAuthenticationController: authenticationController,
    systemAuthenticationState: authenticationState,
    systemConfigurationController,
    systemConfigurationState: systemConfigurationSnapshot,
  });
  const repositorySessionIds = useMemo(
    () => snapshot.catalog.state.status === "ready"
      ? snapshot.catalog.state.repositories.map(({ id }) => id)
      : null,
    [snapshot.catalog.state],
  );

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
          agentRuntime.dispose();
          systemConfigurationController.dispose();
          controller.dispose();
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

  let workbench: ReactNode;

  if (snapshot.workspace.status === "ready") {
    const session = projectWorkspaceSessionApplication(
      controller.workspace,
      snapshot.workspace,
    );

    if (session.status !== "ready") {
      throw new Error("Ready Workspace projection lost its ready state.");
    }
    workbench = (
      <ReadyWorkspaceWorkbench
        scheduler={workbenchRuntime.applicationServices.scheduler}
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
  } else {
    workbench = (
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

  return (
    <RepositorySessionStateProvider repositoryIds={repositorySessionIds}>
      {workbench}
    </RepositorySessionStateProvider>
  );
}
