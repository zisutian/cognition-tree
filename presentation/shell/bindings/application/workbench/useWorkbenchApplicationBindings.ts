import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../../../application/workbench/workbenchController";
import type { WorkbenchFeedbackController } from "../../../../../application/workbench/workbenchFeedbackController";
import {
  createClientJournalApplicationServices,
  createClientTodoApplicationServices,
} from "../../../../../infrastructure/client/clientApplicationServices";
import type { ActivityId } from "../../../../ui/activityTypes";
import { useJournalApplication } from "../journal/useJournalApplication";
import { useRepositoryNavigation } from "../repository/useRepositoryNavigation";
import { useTodoApplication } from "../todo/useTodoApplication";
import { createRepositoryProjection } from "./workbenchApplicationProjection";
import type { SearchResult } from "../../../../../application/search/searchQuery";
import {
  isJournalEntryId,
} from "../../../../../core/journal/model/journalContent";
import {
  isTodoCollectionId,
} from "../../../../../core/todo/model/todoContent";

const workspaceFeedbackActivities = [
  "notes",
  "syntax",
  "search",
] as const;

export function useWorkbenchApplicationBindings({
  controller,
  feedbackController,
  snapshot,
}: {
  controller: WorkbenchController;
  feedbackController: WorkbenchFeedbackController<ActivityId>;
  snapshot: WorkbenchControllerSnapshot;
}) {
  const navigation = useRepositoryNavigation();
  const previousFeedbackRepositoryIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const reportedNavigationFailureRef = useRef<number | null>(null);
  const journalSession = useMemo(() => ({
    mutate: controller.journal.mutate,
    mutatePrepared: controller.journal.mutatePrepared,
    reload: controller.journal.reload,
    state: snapshot.builtIns.journal.state,
  }), [controller, snapshot.builtIns.journal.state]);
  const todoSession = useMemo(() => ({
    mutate: controller.todo.mutate,
    mutatePrepared: controller.todo.mutatePrepared,
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
    apiAccess: {
      administration: controller.apiAccessAdministration,
      repositories: snapshot.catalog.state.status === "ready"
        ? snapshot.catalog.state.repositories.map(({ id, label }) => ({
            id,
            label,
          }))
        : [],
    },
    journal,
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
    todo,
  };
}
