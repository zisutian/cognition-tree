import {
  createWorkbenchFeedbackController,
  type WorkbenchFeedbackController,
} from "../../application/workbench/workbenchFeedbackController";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createBrowserJournalApplicationServices,
  type JournalApplication,
  type JournalWorkspaceNoteDestination,
} from "../../application/journal";
import { useJournalApplication } from "./bindings/application/journal/useJournalApplication";
import {
  createBrowserTodoApplicationServices,
  type TodoApplication,
} from "../../application/todo";
import { useTodoApplication } from "./bindings/application/todo/useTodoApplication";
import type { RepositoryApplication } from "../../application/repository/repositoryApplication";
import type { BuiltInCatalogApplication } from "../../application/repository/builtInCatalogController";
import { useRepositoryNavigation } from "./bindings/application/repository/useRepositoryNavigation";
import { useBuiltInCatalog } from "./bindings/session/useBuiltInCatalog";
import { useJournalSession } from "./bindings/session/useJournalSession";
import { useTodoSession } from "./bindings/session/useTodoSession";
import { useWorkspaceApplication } from "../activities/bindings/workspace/runtime/useWorkspaceApplication";
import {
  useRepositoryCatalog,
  type CreateRepositoryRequest,
  type DeleteRepositoryRequest,
} from "../activities/bindings/workspace/session/useRepositoryCatalog";
import {
  useSession,
  type ActiveSession,
} from "../activities/bindings/workspace/session/useSession";
import {
  createBuiltInConnectionKey,
  createJournalCatalogGeneration,
  createRepositoryApplication,
  createWorkbenchNavigationCoordinator,
  findBuiltInDescriptor,
  openJournalRepository,
  openTodoRepository,
  projectBuiltInSessionSummary,
  type PendingWorkspaceNoteDestination,
} from "../../application/workbench/workbenchCoordinator";
import {
  createJournalWorkspaceReferenceResolver,
  routeJournalWorkspaceNoteDestination,
  routeJournalWorkspaceNoteDestinationWithoutSession,
  type JournalWorkspaceReferenceSnapshot,
} from "../../application/workbench/journalWorkspaceReferences";
import { createBuiltInRuntime } from "../../infrastructure/builtInRuntime";
import { createWorkspaceRepositoryRuntime } from "../../infrastructure/workspaceRepositoryRuntime";
import type { ActivityId } from "../ui/activityTypes";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

type RepositoryCatalogApplication = ReturnType<typeof useRepositoryCatalog>;
type ActivityFeedbackController = WorkbenchFeedbackController<ActivityId>;
type JournalWorkspaceReferenceSnapshotState = {
  generation: number;
  snapshot: JournalWorkspaceReferenceSnapshot | null;
};

function ReadyWorkspaceWorkbench({
  activeActivityId,
  feedbackController,
  builtIns,
  builtInSessions,
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  session,
  workspaceNoteDestination,
}: {
  activeActivityId: ActivityId;
  feedbackController: ActivityFeedbackController;
  builtIns: BuiltInCatalogApplication;
  builtInSessions: RepositoryApplication["builtIns"]["sessions"];
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  session: ActiveSession;
  workspaceNoteDestination: PendingWorkspaceNoteDestination | null;
}) {
  const workspace = useWorkspaceApplication(session);
  const handlingWorkspaceRequestRef = useRef<number | null>(null);

  useEffect(() => {
    const destination = workspaceNoteDestination;

    if (!destination ||
        handlingWorkspaceRequestRef.current === destination.requestId) {
      return;
    }
    handlingWorkspaceRequestRef.current = destination.requestId;
    let mounted = true;

    void (async () => {
      try {
        const outcome = await routeJournalWorkspaceNoteDestination({
          activeRepositoryId: catalog.activeDescriptor?.id ?? null,
          destination,
          flushCurrentSession: session.flushPendingChanges,
          openNoteLine: workspace.navigation.openNoteLine,
          selectRepository: catalog.selectRepository,
        });

        if (outcome === "opened" && mounted) {
          onActiveActivityChange("notes");
          onConsumeWorkspaceNoteDestination(destination.requestId);
        }
      } catch (error) {
        feedbackController.reportError(
          "journal",
          error instanceof Error ? error.message : "无法打开日记引用目标。",
        );
        // Keep the one-shot destination pending. A later session/catalog retry
        // can resume navigation without losing the user's original click.
      } finally {
        if (mounted) {
          handlingWorkspaceRequestRef.current = null;
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    catalog,
    onActiveActivityChange,
    onConsumeWorkspaceNoteDestination,
    session,
    feedbackController,
    workspace.navigation,
    workspaceNoteDestination,
  ]);
  const selectRepository = async (repositoryId: string) => {
    await session.flushPendingChanges();
    await catalog.selectRepository(repositoryId);
  };
  const createRepository = async (input: CreateRepositoryRequest) => {
    await session.flushPendingChanges();
    await catalog.createRepository(input);
  };
  const refreshRepositories = async () => {
    await session.flushPendingChanges();
    await catalog.reload();
  };
  const deleteRepository = async (input: DeleteRepositoryRequest) => {
    if (input.id !== catalog.activeDescriptor?.id) {
      await catalog.deleteRepository(input);
      return;
    }

    const prepared = await session.prepareForRepositoryRemoval();

    try {
      await catalog.deleteRepository(input);
    } catch (error) {
      prepared.resume();
      throw error;
    }
  };
  const repository = createRepositoryApplication({
    builtIns,
    builtInSessions,
    catalog,
    createRepository,
    deleteRepository,
    navigation,
    refreshRepositories,
    session: {
      discardPendingChangesAndReload: session.discardPendingChangesAndReload,
      persistence: session.persistence,
      reload: session.reload,
      status: "ready",
      storageLabel: session.storageLabel,
    },
    selectRepository,
  });

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        journal,
        repository,
        todo,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

function RepositoryWorkspaceApp({
  activeActivityId,
  feedbackController,
  builtIns,
  builtInSessions,
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  onWorkspaceReferenceSnapshotChange,
  workspaceNoteDestination,
}: {
  activeActivityId: ActivityId;
  feedbackController: ActivityFeedbackController;
  builtIns: BuiltInCatalogApplication;
  builtInSessions: RepositoryApplication["builtIns"]["sessions"];
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  onWorkspaceReferenceSnapshotChange: (
    snapshot: JournalWorkspaceReferenceSnapshot | null,
  ) => void;
  workspaceNoteDestination: PendingWorkspaceNoteDestination | null;
}) {
  const repository = catalog.repository;

  if (!repository) {
    throw new Error("Active repository disappeared before session mount.");
  }
  const session = useSession({ repository });
  const referenceWorkspace = session.status === "ready"
    ? session.workspace.data
    : null;
  const activeRepositoryId = catalog.activeDescriptor?.id ?? null;

  useEffect(() => {
    onWorkspaceReferenceSnapshotChange(
      activeRepositoryId && referenceWorkspace
        ? {
            repositoryId: activeRepositoryId,
            workspace: referenceWorkspace,
          }
        : null,
    );
  }, [
    activeRepositoryId,
    onWorkspaceReferenceSnapshotChange,
    referenceWorkspace,
  ]);

  if (session.status === "ready") {
    return (
      <ReadyWorkspaceWorkbench
        activeActivityId={activeActivityId}
        feedbackController={feedbackController}
        builtIns={builtIns}
        builtInSessions={builtInSessions}
        catalog={catalog}
        journal={journal}
        todo={todo}
        navigation={navigation}
        onConsumeWorkspaceNoteDestination={onConsumeWorkspaceNoteDestination}
        onActiveActivityChange={onActiveActivityChange}
        session={session}
        workspaceNoteDestination={workspaceNoteDestination}
      />
    );
  }

  const sessionState: RepositoryApplication["session"] =
    session.status === "loading"
      ? session
      : {
          errorMessage: session.errorMessage,
          retry: session.retry,
          status: "failed",
          storageLabel: session.storageLabel,
        };
  const repositoryApplication = createRepositoryApplication({
    builtIns,
    builtInSessions,
    catalog,
    navigation,
    session: sessionState,
  });

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{
        journal,
        repository: repositoryApplication,
        todo,
        workspace: sessionState,
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

function EmptyWorkspaceApp({
  activeActivityId,
  feedbackController,
  builtIns,
  builtInSessions,
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination: _onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  onWorkspaceReferenceSnapshotChange,
  workspaceNoteDestination,
}: {
  activeActivityId: ActivityId;
  feedbackController: ActivityFeedbackController;
  builtIns: BuiltInCatalogApplication;
  builtInSessions: RepositoryApplication["builtIns"]["sessions"];
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  onWorkspaceReferenceSnapshotChange: (
    snapshot: JournalWorkspaceReferenceSnapshot | null,
  ) => void;
  workspaceNoteDestination: PendingWorkspaceNoteDestination | null;
}) {
  const handlingWorkspaceRequestRef = useRef<number | null>(null);

  useEffect(() => {
    onWorkspaceReferenceSnapshotChange(null);
  }, [onWorkspaceReferenceSnapshotChange]);

  useEffect(() => {
    const destination = workspaceNoteDestination;

    if (!destination ||
        handlingWorkspaceRequestRef.current === destination.requestId ||
        catalog.state.status !== "ready" ||
        !catalog.state.repositories.some(
          ({ id }) => id === destination.repositoryId,
        )) {
      return;
    }
    handlingWorkspaceRequestRef.current = destination.requestId;
    let mounted = true;

    void routeJournalWorkspaceNoteDestinationWithoutSession(
      destination,
      catalog.selectRepository,
    ).catch((error: unknown) => {
      feedbackController.reportError(
        "journal",
        error instanceof Error ? error.message : "无法打开日记引用目标。",
      );
      if (mounted) {
        handlingWorkspaceRequestRef.current = null;
      }
    });
    return () => {
      mounted = false;
    };
  }, [catalog, feedbackController, workspaceNoteDestination]);
  const repository = createRepositoryApplication({
    builtIns,
    builtInSessions,
    catalog,
    navigation,
    session: { status: "absent" },
  });
  const workspace = catalog.state.status === "loading"
    ? { status: "loading" as const, storageLabel: catalog.catalogLabel }
    : catalog.state.status === "failed"
      ? {
          errorMessage: catalog.state.errorMessage,
          retry: catalog.reload,
          status: "failed" as const,
          storageLabel: catalog.catalogLabel,
        }
      : { status: "absent" as const };

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      feedbackController={feedbackController}
      application={{ journal, repository, todo, workspace }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

export function AppRoot() {
  const feedbackController = useMemo(
    () => createWorkbenchFeedbackController<ActivityId>(),
    [],
  );
  const repositoryRuntime = useMemo(
    () => createWorkspaceRepositoryRuntime(),
    [],
  );
  const builtInRuntime = useMemo(() => createBuiltInRuntime(), []);
  const catalog = useRepositoryCatalog(
    repositoryRuntime.catalog,
    repositoryRuntime.activeRepositorySelection,
  );
  const builtIns = useBuiltInCatalog(builtInRuntime.catalog);
  const navigation = useRepositoryNavigation();
  const workspaceNavigation = useMemo(
    createWorkbenchNavigationCoordinator,
    [],
  );
  const workspaceNoteDestination = useSyncExternalStore(
    workspaceNavigation.subscribe,
    workspaceNavigation.getSnapshot,
    workspaceNavigation.getSnapshot,
  );
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const previousFeedbackRepositoryIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const [journalWorkspaceReferenceSnapshot, setJournalWorkspaceReferenceSnapshot] =
    useState<JournalWorkspaceReferenceSnapshotState>({
      generation: 0,
      snapshot: null,
    });
  const journalDescriptor = findBuiltInDescriptor(builtIns, "journal");
  const todoDescriptor = findBuiltInDescriptor(builtIns, "todo");
  const journalConnectionKey = createBuiltInConnectionKey(journalDescriptor);
  const todoConnectionKey = createBuiltInConnectionKey(todoDescriptor);
  const journalRepository = useMemo(
    () => openJournalRepository(builtInRuntime.catalog, journalDescriptor),
    // Descriptor identity is deliberately reduced to storage connection data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builtInRuntime.catalog, journalConnectionKey],
  );
  const todoRepository = useMemo(
    () => openTodoRepository(builtInRuntime.catalog, todoDescriptor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builtInRuntime.catalog, todoConnectionKey],
  );
  const journalSession = useJournalSession(journalRepository);
  const todoSession = useTodoSession(todoRepository);
  const journalServices = useMemo(
    () => createBrowserJournalApplicationServices(),
    [],
  );
  const updateJournalWorkspaceReferenceSnapshot = useCallback((
    snapshot: JournalWorkspaceReferenceSnapshot | null,
  ) => {
    setJournalWorkspaceReferenceSnapshot((current) => {
      if (current.snapshot === null || snapshot === null) {
        if (current.snapshot === snapshot) {
          return current;
        }
      } else if (
        current.snapshot.repositoryId === snapshot.repositoryId &&
        current.snapshot.workspace === snapshot.workspace
      ) {
        return current;
      }
      return {
        generation: current.generation + 1,
        snapshot,
      };
    });
  }, []);
  const journalCatalogGeneration = createJournalCatalogGeneration(
    catalog.state,
  );
  const journalReferenceResolver = useMemo(
    () => createJournalWorkspaceReferenceResolver(
      repositoryRuntime.catalog,
      { workspaceSnapshot: journalWorkspaceReferenceSnapshot.snapshot },
    ),
    [journalWorkspaceReferenceSnapshot.snapshot, repositoryRuntime.catalog],
  );
  const openWorkspaceNote = useCallback(
    (destination: JournalWorkspaceNoteDestination) => {
      workspaceNavigation.request(destination);
    },
    [workspaceNavigation],
  );
  const consumeWorkspaceNoteDestination = useCallback((requestId: number) => {
    workspaceNavigation.consume(requestId);
  }, [workspaceNavigation]);
  const journal = useJournalApplication({
    openWorkspaceNote,
    referenceResolutionGeneration:
      `${journalCatalogGeneration}:${journalWorkspaceReferenceSnapshot.generation}`,
    referenceResolver: journalReferenceResolver,
    services: journalServices,
    session: journalSession,
  });
  const todoServices = useMemo(
    () => createBrowserTodoApplicationServices(),
    [],
  );
  const todo = useTodoApplication({
    services: todoServices,
    session: todoSession,
  });
  const builtInSessions = useMemo(
    () => ({
      journal: projectBuiltInSessionSummary(journalSession),
      todo: projectBuiltInSessionSummary(todoSession),
    }),
    [journalSession, todoSession],
  );
  useEffect(() => {
    const repositoryId = catalog.activeDescriptor?.id ?? null;
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
  }, [catalog.activeDescriptor?.id, feedbackController]);

  useEffect(() => () => feedbackController.dispose(), [feedbackController]);
  const common = {
    activeActivityId,
    builtIns,
    builtInSessions,
    catalog,
    feedbackController,
    journal,
    todo,
    navigation,
    onConsumeWorkspaceNoteDestination: consumeWorkspaceNoteDestination,
    onActiveActivityChange: setActiveActivityId,
    onWorkspaceReferenceSnapshotChange:
      updateJournalWorkspaceReferenceSnapshot,
    workspaceNoteDestination,
  };

  return catalog.repository ? (
    <RepositoryWorkspaceApp
      {...common}
      key={catalog.activeDescriptor?.id}
    />
  ) : (
    <EmptyWorkspaceApp {...common} />
  );
}
