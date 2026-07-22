import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { JournalApplication } from "../../application/journal";
import type { TodoApplication } from "../../application/todo";
import {
  createRepositoryApplication,
  projectBuiltInSessionSummary,
  type BuiltInSessionSummary,
  type RepositoryApplication,
  type RepositorySessionState,
} from "../../application/repository/repositoryApplication";
import {
  createWorkbenchFeedbackController,
  type WorkbenchFeedbackController,
} from "../../application/workbench/workbenchFeedbackController";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
  WorkbenchWorkspaceSession,
} from "../../application/workbench/workbenchController";
import {
  projectWorkspaceSessionApplication,
  type ActiveWorkspaceSession,
} from "../../application/workspace/session/workspaceSessionApplication";
import {
  browserApplicationScheduler,
  createBrowserJournalApplicationServices,
  createBrowserTodoApplicationServices,
} from "../../infrastructure/browser/browserApplicationServices";
import { createWorkbenchRuntime } from "../../infrastructure/workbenchRuntime";
import { useWorkspaceApplication } from "../activities/bindings/workspace/runtime/useWorkspaceApplication";
import type { WorkbenchApplication } from "../activities/workbenchApplication";
import type { ActivityId } from "../ui/activityTypes";
import { useJournalApplication } from "./bindings/application/journal/useJournalApplication";
import { useRepositoryNavigation } from "./bindings/application/repository/useRepositoryNavigation";
import { useTodoApplication } from "./bindings/application/todo/useTodoApplication";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

type ActivityFeedbackController = WorkbenchFeedbackController<ActivityId>;

function projectRepositorySession(
  workspace: WorkbenchWorkspaceSession,
): RepositorySessionState {
  if (workspace.status === "absent") return workspace;
  if (workspace.status === "loading") {
    return { status: "loading", storageLabel: workspace.storageLabel };
  }
  if (workspace.status === "failed") {
    return {
      errorMessage: workspace.errorMessage,
      retry: workspace.controller.reload,
      status: "failed",
      storageLabel: workspace.storageLabel,
    };
  }
  return {
    discardPendingChangesAndReload:
      workspace.controller.discardPendingChangesAndReload,
    persistence: workspace.persistence,
    reload: workspace.controller.reload,
    status: "ready",
    storageLabel: workspace.storageLabel,
  };
}

function projectBuiltInSessions(
  snapshot: WorkbenchControllerSnapshot,
): Record<"journal" | "todo", BuiltInSessionSummary> {
  return {
    journal: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        snapshot.builtIns.journal.controller.discardPendingChangesAndReload,
      reload: snapshot.builtIns.journal.controller.reload,
      requestSync: snapshot.builtIns.journal.controller.requestSync,
      state: snapshot.builtIns.journal.state,
    }),
    todo: projectBuiltInSessionSummary({
      discardPendingChangesAndReload:
        snapshot.builtIns.todo.controller.discardPendingChangesAndReload,
      reload: snapshot.builtIns.todo.controller.reload,
      requestSync: snapshot.builtIns.todo.controller.requestSync,
      state: snapshot.builtIns.todo.state,
    }),
  };
}

function createRepositoryProjection(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
  navigation: ReturnType<typeof useRepositoryNavigation>,
): RepositoryApplication {
  return createRepositoryApplication({
    builtInSessions: projectBuiltInSessions(snapshot),
    builtIns: snapshot.builtIns.catalog,
    catalog: {
      activeDescriptor: snapshot.catalog.activeDescriptor,
      catalogLabel: snapshot.catalog.catalogLabel,
      createRepository: controller.createRepository,
      deleteRepository: controller.deleteRepository,
      reload: controller.refreshRepositories,
      renameRepository: controller.renameRepository,
      selectRepository: controller.selectRepository,
      state: snapshot.catalog.state,
    },
    navigation,
    session: projectRepositorySession(snapshot.workspace),
  });
}

function projectUnavailableWorkspace(
  controller: WorkbenchController,
  snapshot: WorkbenchControllerSnapshot,
): WorkbenchApplication["workspace"] {
  if (snapshot.workspace.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.workspace.status === "failed") {
    return {
      errorMessage: snapshot.workspace.errorMessage,
      retry: snapshot.workspace.controller.reload,
      status: "failed",
      storageLabel: snapshot.workspace.storageLabel,
    };
  }
  if (snapshot.catalog.state.status === "loading") {
    return {
      status: "loading",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  if (snapshot.catalog.state.status === "failed") {
    return {
      errorMessage: snapshot.catalog.state.errorMessage,
      retry: controller.refreshRepositories,
      status: "failed",
      storageLabel: snapshot.catalog.catalogLabel,
    };
  }
  return { status: "absent" };
}

type ReadyWorkbenchProps = {
  activeActivityId: ActivityId;
  controller: WorkbenchController;
  feedbackController: ActivityFeedbackController;
  journal: JournalApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onActiveActivityChange: (activityId: ActivityId) => void;
  session: ActiveWorkspaceSession;
  snapshot: WorkbenchControllerSnapshot;
  todo: TodoApplication;
};

function ReadyWorkbench({
  activeActivityId,
  controller,
  feedbackController,
  journal,
  navigation,
  onActiveActivityChange,
  session,
  snapshot,
  todo,
}: ReadyWorkbenchProps) {
  const workspace = useWorkspaceApplication(session);
  const focusRequest = snapshot.navigation.status === "ready"
    ? snapshot.navigation
    : null;

  useEffect(() => {
    if (!focusRequest) return;
    workspace.navigation.openNoteLine(
      focusRequest.destination.noteId,
      focusRequest.destination.lineNumber,
    );
    onActiveActivityChange("notes");
    controller.consumeWorkspaceNoteDestination(focusRequest.requestId);
  }, [controller, focusRequest, onActiveActivityChange, workspace.navigation]);

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        journal,
        repository: createRepositoryProjection(
          controller,
          snapshot,
          navigation,
        ),
        todo,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

export function AppRoot() {
  const controller = useMemo(createWorkbenchRuntime, []);
  const feedbackController = useMemo(
    () => createWorkbenchFeedbackController<ActivityId>({
      scheduler: browserApplicationScheduler,
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
  const navigation = useRepositoryNavigation();
  const previousFeedbackRepositoryIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const reportedNavigationFailureRef = useRef<number | null>(null);

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
  const todo = useTodoApplication({ services: todoServices, session: todoSession });

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
    ([
      "notes",
      "structure-operation",
      "visualization",
      "syntax",
      "search",
      "data",
    ] as const).forEach((activityId) =>
      feedbackController.dismissScope(activityId)
    );
  }, [feedbackController, snapshot.catalog.activeDescriptor?.id]);

  if (snapshot.workspace.status === "ready") {
    const session = projectWorkspaceSessionApplication(
      snapshot.workspace.controller,
      snapshot.workspace,
    );

    if (session.status !== "ready") {
      throw new Error("Ready Workspace projection lost its ready state.");
    }
    return (
      <ReadyWorkbench
        activeActivityId={activeActivityId}
        controller={controller}
        feedbackController={feedbackController}
        journal={journal}
        key={snapshot.catalog.activeDescriptor?.id}
        navigation={navigation}
        onActiveActivityChange={setActiveActivityId}
        session={session}
        snapshot={snapshot}
        todo={todo}
      />
    );
  }

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        journal,
        repository: createRepositoryProjection(
          controller,
          snapshot,
          navigation,
        ),
        todo,
        workspace: projectUnavailableWorkspace(controller, snapshot),
      }}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}
