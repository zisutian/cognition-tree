import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { ProblemCenterController } from "../../../application/problems/problemCenter";
import {
  createClientJournalApplicationServices,
  createClientTodoApplicationServices,
} from "../../../infrastructure/client/platform/applicationServices";
import type { ActivityId } from "../../ui/activityTypes";
import { useJournalApplication } from "./useJournalApplication";
import { useRepositoryNavigation } from "./useRepositoryNavigation";
import { useTodoApplication } from "./useTodoApplication";
import { createRepositoryProjection } from "../../../application/workbench/repositoryApplicationProjection";
import type { SearchResult } from "../../../application/search/searchTypes";
import {
  isJournalEntryId,
} from "../../../core/journal/model/journalIdentity";
import {
  isTodoCollectionId,
} from "../../../core/todo/model/todoIdentity";
import type {
  AgentClientController,
  AgentClientState,
  AgentConfigurationController,
  AgentConfigurationState,
  AgentScopeCatalog,
} from "../../../application/agent";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
  SystemConfigurationController,
  SystemConfigurationState,
} from "../../../application/system";
import type { ApiAccessAdministration } from
  "../../../application/apiAccess/apiAccessAdministration";
import type { OperationAdministration } from
  "../../../application/operations/operationAdministration";

const workspaceFeedbackActivities = [
  "notes",
  "syntax",
  "search",
] as const;

export function useWorkbenchApplicationBindings({
  agentConfigurationController,
  agentConfigurationState,
  agentController,
  agentState,
  apiAccessAdministration,
  controller,
  feedbackController,
  operationAdministration,
  snapshot,
  systemAuthenticationController,
  systemAuthenticationState,
  systemConfigurationController,
  systemConfigurationState,
}: {
  agentConfigurationController: AgentConfigurationController;
  agentConfigurationState: AgentConfigurationState;
  agentController: AgentClientController;
  agentState: AgentClientState;
  apiAccessAdministration: ApiAccessAdministration;
  controller: WorkbenchController;
  feedbackController: ProblemCenterController<ActivityId>;
  operationAdministration: OperationAdministration;
  snapshot: WorkbenchControllerSnapshot;
  systemAuthenticationController: OwnerAuthenticationController;
  systemAuthenticationState: OwnerAuthenticationState;
  systemConfigurationController: SystemConfigurationController;
  systemConfigurationState: SystemConfigurationState;
}) {
  const navigation = useRepositoryNavigation();
  const previousFeedbackRepositoryIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const reportedNavigationFailureRef = useRef<number | null>(null);
  const journalSession = useMemo(() => ({
    mutate: controller.journal.mutate,
    reload: controller.journal.reload,
    state: snapshot.builtIns.journal.state,
  }), [controller, snapshot.builtIns.journal.state]);
  const todoSession = useMemo(() => ({
    mutate: controller.todo.mutate,
    reload: controller.todo.reload,
    state: snapshot.builtIns.todo.state,
  }), [controller, snapshot.builtIns.todo.state]);
  const journalServices = useMemo(
    createClientJournalApplicationServices,
    [],
  );
  const todoServices = useMemo(createClientTodoApplicationServices, []);
  const openWorkspaceNote = useCallback(
    (destination: Parameters<
      WorkbenchController["requestWorkspaceNoteDestination"]
    >[0]) => {
      controller.requestWorkspaceNoteDestination(destination);
    },
    [controller],
  );
  const journal = useJournalApplication({
    openWorkspaceNote,
    referenceResolutionGeneration: snapshot.referenceResolutionGeneration,
    referenceResolver: controller.journalReferenceResolver,
    services: journalServices,
    session: journalSession,
  });
  const todo = useTodoApplication({
    services: todoServices,
    session: todoSession,
  });
  const agentScopeCatalog: AgentScopeCatalog = useMemo(() => {
    const catalog = snapshot.catalog.state.status === "ready"
      ? snapshot.catalog.state.repositories.map(({ id, label }) => ({
          id,
          label,
        }))
      : [];
    const activeDescriptor = snapshot.catalog.activeDescriptor;
    const activeWorkspace = activeDescriptor &&
        snapshot.workspace.status === "ready"
      ? {
          folderOptions: [...snapshot.workspace.workspace.folderEntryById]
            .map(([id, entry]) => ({ id, label: entry.node.title }))
            .sort((left, right) => left.label.localeCompare(right.label)),
          noteOptions: [...snapshot.workspace.workspace.noteEntryById]
            .map(([id, entry]) => ({
              id,
              label: entry.projectedNote.title,
            }))
            .sort((left, right) => left.label.localeCompare(right.label)),
          repositoryId: activeDescriptor.id,
        }
      : null;
    const journalEntryOptions = journal.status === "ready"
      ? journal.view.calendar.years.flatMap(({ months }) =>
          months.flatMap(({ entries }) =>
            entries.map(({ id, title }) => ({ id, label: title }))
          )
        )
      : [];
    const todoCollectionOptions = todo.status === "ready"
      ? todo.view.collections.map(({ id, name }) => ({ id, label: name }))
      : [];

    return {
      activeWorkspace,
      journalEntryOptions,
      repositoryOptions: catalog,
      todoCollectionOptions,
    };
  }, [journal, snapshot.catalog, snapshot.workspace, todo]);
  const openSearchResult = useCallback((result: SearchResult) => {
    if (result.domain === "workspace") {
      controller.requestWorkspaceNoteDestination({
        blockId: result.blockId,
        domain: result.domain,
        repositoryId: result.repositoryId,
        resourceId: result.resourceId,
      });
      return { domain: result.domain, status: "opened" as const };
    }
    if (result.domain === "journal") {
      if (
        journal.status !== "ready" ||
        !isJournalEntryId(result.resourceId)
      ) {
        return { domain: result.domain, status: "unavailable" as const };
      }
      const found = journal.view.navigation.openEntryBlock(
        result.resourceId,
        result.blockId,
      );

      return {
        domain: result.domain,
        status: found ? "opened" as const : "stale" as const,
      };
    }
    if (
      todo.status !== "ready" ||
      !isTodoCollectionId(result.resourceId)
    ) {
      return { domain: result.domain, status: "unavailable" as const };
    }
    const found = todo.view.navigation.openCollectionBlock(
      result.resourceId,
      result.blockId,
    );

    return {
      domain: result.domain,
      status: found ? "opened" as const : "stale" as const,
    };
  }, [controller, journal, todo]);

  useEffect(() => {
    if (
      snapshot.navigation.status !== "failed" ||
      reportedNavigationFailureRef.current === snapshot.navigation.requestId
    ) {
      return;
    }
    reportedNavigationFailureRef.current = snapshot.navigation.requestId;
    feedbackController.reportError(
      "journal",
      snapshot.navigation.errorMessage,
    );
  }, [feedbackController, snapshot.navigation]);

  useEffect(() => {
    const repositoryId = snapshot.catalog.activeDescriptor?.id ?? null;
    const previousRepositoryId = previousFeedbackRepositoryIdRef.current;

    previousFeedbackRepositoryIdRef.current = repositoryId;
    if (
      previousRepositoryId === undefined ||
      previousRepositoryId === repositoryId
    ) {
      return;
    }
    workspaceFeedbackActivities.forEach((activityId) =>
      feedbackController.dismissScope(activityId)
    );
  }, [feedbackController, snapshot.catalog.activeDescriptor?.id]);

  return {
    agent: {
      configurationController: agentConfigurationController,
      configurationState: agentConfigurationState,
      controller: agentController,
      scopeCatalog: agentScopeCatalog,
      state: agentState,
    },
    apiAccess: {
      administration: apiAccessAdministration,
      repositories: snapshot.catalog.state.status === "ready"
        ? snapshot.catalog.state.repositories.map(({ id, label }) => ({
            id,
            label,
          }))
        : [],
    },
    journal,
    operations: {
      administration: operationAdministration,
    },
    repository: createRepositoryProjection(
      controller,
      snapshot,
      navigation,
    ),
    search: {
      controller: controller.search,
      openResult: openSearchResult,
      state: snapshot.search,
    },
    system: {
      authenticationController: systemAuthenticationController,
      authenticationState: systemAuthenticationState,
      configurationController: systemConfigurationController,
      configurationState: systemConfigurationState,
    },
    todo,
  };
}
