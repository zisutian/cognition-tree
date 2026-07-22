import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../../../application/workbench/workbenchController";
import type { WorkbenchFeedbackController } from "../../../../../application/workbench/workbenchFeedbackController";
import {
  createBrowserJournalApplicationServices,
  createBrowserTodoApplicationServices,
} from "../../../../../infrastructure/browser/browserApplicationServices";
import type { ActivityId } from "../../../../ui/activityTypes";
import { useJournalApplication } from "../journal/useJournalApplication";
import { useRepositoryNavigation } from "../repository/useRepositoryNavigation";
import { useTodoApplication } from "../todo/useTodoApplication";
import { createRepositoryProjection } from "./workbenchApplicationProjection";

const workspaceFeedbackActivities = [
  "notes",
  "structure-operation",
  "visualization",
  "syntax",
  "search",
  "data",
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
    reload: snapshot.builtIns.journal.controller.reload,
    state: snapshot.builtIns.journal.state,
    updateContent: snapshot.builtIns.journal.controller.updateContent,
  }), [snapshot.builtIns.journal]);
  const todoSession = useMemo(() => ({
    reload: snapshot.builtIns.todo.controller.reload,
    state: snapshot.builtIns.todo.state,
    updateContent: snapshot.builtIns.todo.controller.updateContent,
  }), [snapshot.builtIns.todo]);
  const journalServices = useMemo(
    createBrowserJournalApplicationServices,
    [],
  );
  const todoServices = useMemo(createBrowserTodoApplicationServices, []);
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
    referenceResolver: snapshot.journalReferenceResolver,
    services: journalServices,
    session: journalSession,
  });
  const todo = useTodoApplication({
    services: todoServices,
    session: todoSession,
  });

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
    journal,
    repository: createRepositoryProjection(
      controller,
      snapshot,
      navigation,
    ),
    todo,
  };
}
