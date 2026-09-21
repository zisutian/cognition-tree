// SPDX-License-Identifier: GPL-3.0-or-later

import { PageNavigationProvider } from "../navigation/index.ts";
import { createPageNavigation } from "../navigation/index.ts";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import { RepositorySessionStateProvider } from "../ui/index.ts";
import { useWorkbenchApplicationBindings } from "./application/useWorkbenchApplicationBindings.ts";
import { projectUnavailableWorkspace } from "./application/workbenchApplicationProjection.ts";
import { WorkspaceApplicationBinding } from "./workbench/WorkspaceApplicationBinding.tsx";
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
    () =>
      createProblemCenter<ActivityId>({
        scheduler: clientApplicationScheduler,
      }),
    [],
  );
  const agentRuntime = useMemo(
    () =>
      createClientAgentRuntime(
        api,
        async (scope) => {
          const current = controller.getSnapshot();

          if (scope.domain === "workspace") {
            if (current.catalog.activeDescriptor?.id !== scope.repositoryId)
              return;
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
      ),
    [api, controller, feedbackController],
  );
  const systemConfigurationController = useMemo(
    () =>
      createClientSystemConfigurationRuntime(
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
  const [navigation] = useState(() => createPageNavigation("notes"));
  const { activeActivityId, interaction } = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const applications = useWorkbenchApplicationBindings({
    applicationServices: workbenchRuntime.applicationServices,
    agentConfigurationController: agentRuntime.configuration,
    agentConfigurationState: agentConfigurationSnapshot,
    agentController: agentRuntime.session,
    agentState: agentSnapshot,
    localApi: workbenchRuntime.localApi,
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
    () =>
      snapshot.catalog.state.status === "ready"
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
          navigation.dispose();
          agentRuntime.dispose();
          systemConfigurationController.dispose();
          controller.dispose();
          feedbackController.dispose();
        }
      });
    };
  }, [
    agentRuntime,
    navigation,
    controller,
    feedbackController,
    systemConfigurationController,
  ]);

  useLayoutEffect(() => {
    const contentSession = (
      target: import("../navigation/index.ts").PageTarget,
    ) => {
      const current = controller.getSnapshot();
      if (
        target.kind === "note" &&
        target.repositoryId === current.catalog.activeDescriptor?.id
      )
        return current.workspace;
      if (target.kind === "journal-entry")
        return current.builtIns.journal.state;
      if (target.kind === "todo-collection") return current.builtIns.todo.state;
      return null;
    };
    navigation.setGuards({
      canRelease: (target) => {
        const session = contentSession(target);
        return (
          !session ||
          (session.status === "ready" && session.persistence.status === "saved")
        );
      },
      beforeClose: (target) => {
        const session = contentSession(target);
        if (
          !session ||
          (session.status === "ready" && session.persistence.status === "saved")
        )
          return;
        if (target.kind === "note")
          return controller.workspace.synchronizePendingChanges();
        if (target.kind === "journal-entry")
          return controller.journal.synchronizePendingChanges();
        if (target.kind === "todo-collection")
          return controller.todo.synchronizePendingChanges();
      },
      reportError: (error) =>
        feedbackController.reportError(
          navigation.getSnapshot().activeActivityId,
          error,
        ),
    });
  }, [navigation, controller, feedbackController]);

  useLayoutEffect(() => {
    navigation.setRepository(snapshot.catalog.activeDescriptor?.id ?? null);
    if (repositorySessionIds)
      navigation.retainRepositories(new Set(repositorySessionIds));
  }, [navigation, snapshot.catalog.activeDescriptor?.id, repositorySessionIds]);

  const readySession =
    snapshot.workspace.status === "ready"
      ? projectWorkspaceSessionApplication(
          controller.workspace,
          snapshot.workspace,
        )
      : null;
  const repositoryId =
    readySession?.status === "ready"
      ? (snapshot.catalog.activeDescriptor?.id ?? null)
      : null;

  return (
    <PageNavigationProvider navigation={navigation}>
      <RepositorySessionStateProvider repositoryIds={repositorySessionIds}>
        <WorkspaceWorkbench
          activeActivityId={activeActivityId}
          feedbackController={feedbackController}
          application={{
            ...applications,
            workspace: projectUnavailableWorkspace(controller, snapshot),
          }}
          workspaceRepositoryId={repositoryId}
          bindWorkspace={(onChange) =>
            readySession?.status === "ready" && repositoryId ? (
              <WorkspaceApplicationBinding
                key={repositoryId}
                repositoryId={repositoryId}
                scheduler={workbenchRuntime.applicationServices.scheduler}
                controller={controller}
                feedbackController={feedbackController}
                onActiveActivityChange={navigation.request}
                session={readySession}
                snapshot={snapshot}
                onChange={onChange}
              />
            ) : null
          }
          onActiveActivityChange={navigation.request}
          onInteractionStateChange={navigation.reportInteraction}
          interaction={interaction}
        />
      </RepositorySessionStateProvider>
    </PageNavigationProvider>
  );
}
