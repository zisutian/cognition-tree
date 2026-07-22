import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBrowserJournalApplicationServices,
  createJournalWorkspaceReferenceResolver,
  routeJournalWorkspaceNoteDestination,
  routeJournalWorkspaceNoteDestinationWithoutSession,
  useJournalApplication,
  type JournalApplication,
  type JournalWorkspaceNoteDestination,
  type JournalWorkspaceReferenceSnapshot,
} from "../application/journal";
import {
  createBrowserTodoApplicationServices,
  useTodoApplication,
  type TodoApplication,
} from "../application/todo";
import type { RepositoryApplication } from "../application/repository/repositoryApplication";
import { useRepositoryNavigation } from "../application/repository/useRepositoryNavigation";
import { useSystemRepositoryCatalog } from "../application/repository/useSystemRepositoryCatalog";
import { useSystemRepositorySession } from "../application/repository/useSystemRepositorySession";
import { useWorkspaceApplication } from "../application/workspace/runtime/useWorkspaceApplication";
import {
  useRepositoryCatalog,
  type CreateRepositoryRequest,
  type DeleteRepositoryRequest,
  type RenameRepositoryRequest,
} from "../application/workspace/session/useRepositoryCatalog";
import {
  useSession,
  type ActiveSession,
} from "../application/workspace/session/useSession";
import type {
  SystemRepositoryCatalog,
  SystemRepositoryDescriptor,
  SystemRepositoryPurpose,
} from "../storage/repository/systemRepository";
import { createSystemRepositoryRuntime } from "../storage/runtime/systemRepositoryRuntime";
import { createWorkspaceRepositoryRuntime } from "../storage/runtime/workspaceRepositoryRuntime";
import type { ActivityId } from "../ui/activityTypes";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";

type RepositoryCatalogApplication = ReturnType<typeof useRepositoryCatalog>;
type SystemCatalogApplication = ReturnType<typeof useSystemRepositoryCatalog>;
type PendingWorkspaceNoteDestination = JournalWorkspaceNoteDestination & {
  requestId: number;
};
type JournalWorkspaceReferenceSnapshotState = {
  generation: number;
  snapshot: JournalWorkspaceReferenceSnapshot | null;
};

function createJournalCatalogGeneration(
  state: RepositoryCatalogApplication["state"],
) {
  return state.status === "ready"
    ? JSON.stringify(state.repositories.map(({ id, label, labelIssue }) => [
        id,
        label,
        labelIssue,
      ]))
    : state.status;
}

function findSystemDescriptor(
  systems: SystemCatalogApplication,
  purpose: SystemRepositoryPurpose,
) {
  return systems.state.status === "ready"
    ? systems.state.repositories.find(({ id }) => id === purpose) ?? null
    : null;
}

function createSystemConnectionKey(
  descriptor: SystemRepositoryDescriptor | null,
) {
  return descriptor
    ? JSON.stringify({ id: descriptor.id, location: descriptor.location })
    : "";
}

function openSystemRepository(
  catalog: SystemRepositoryCatalog,
  descriptor: SystemRepositoryDescriptor | null,
) {
  return descriptor ? catalog.openRepository(descriptor) : null;
}

function createRepositoryApplication({
  catalog,
  createRepository = async (input) => {
    await catalog.createRepository(input);
  },
  deleteRepository = async (input) => {
    await catalog.deleteRepository(input);
  },
  navigation,
  refreshRepositories = catalog.reload,
  renameRepository = async (input) => {
    await catalog.renameRepository(input);
  },
  selectRepository = catalog.selectRepository,
  session,
  systemRepositories,
  systemSessions,
  systems,
}: {
  catalog: RepositoryCatalogApplication;
  createRepository?: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository?: (input: DeleteRepositoryRequest) => Promise<void>;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  refreshRepositories?: () => Promise<void>;
  renameRepository?: (input: RenameRepositoryRequest) => Promise<void>;
  selectRepository?: (repositoryId: string) => Promise<void>;
  session: RepositoryApplication["session"];
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
}): RepositoryApplication {
  return {
    activeDescriptor: catalog.activeDescriptor,
    catalogLabel: catalog.catalogLabel,
    catalogState: catalog.state,
    createRepository,
    deleteRepository,
    navigation,
    refreshRepositories,
    renameRepository,
    selectRepository,
    session,
    systems: {
      catalog: systems,
      repositories: systemRepositories,
      sessions: systemSessions,
    },
  };
}

function ReadyWorkspaceWorkbench({
  activeActivityId,
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  session,
  workspaceNoteDestination,
  systemRepositories,
  systemSessions,
  systems,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  session: ActiveSession;
  workspaceNoteDestination: PendingWorkspaceNoteDestination | null;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
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
      } catch {
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
    systemRepositories,
    systemSessions,
    systems,
  });

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
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
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  onWorkspaceReferenceSnapshotChange,
  systemRepositories,
  systemSessions,
  systems,
  workspaceNoteDestination,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  onWorkspaceReferenceSnapshotChange: (
    snapshot: JournalWorkspaceReferenceSnapshot | null,
  ) => void;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
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
        catalog={catalog}
        journal={journal}
        todo={todo}
        navigation={navigation}
        onConsumeWorkspaceNoteDestination={onConsumeWorkspaceNoteDestination}
        onActiveActivityChange={onActiveActivityChange}
        session={session}
        systemRepositories={systemRepositories}
        systemSessions={systemSessions}
        systems={systems}
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
    catalog,
    navigation,
    session: sessionState,
    systemRepositories,
    systemSessions,
    systems,
  });

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
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
  catalog,
  journal,
  todo,
  navigation,
  onConsumeWorkspaceNoteDestination: _onConsumeWorkspaceNoteDestination,
  onActiveActivityChange,
  onWorkspaceReferenceSnapshotChange,
  systemRepositories,
  systemSessions,
  systems,
  workspaceNoteDestination,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  journal: JournalApplication;
  todo: TodoApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onConsumeWorkspaceNoteDestination: (requestId: number) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  onWorkspaceReferenceSnapshotChange: (
    snapshot: JournalWorkspaceReferenceSnapshot | null,
  ) => void;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
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
    ).catch(() => {
      if (mounted) {
        handlingWorkspaceRequestRef.current = null;
      }
    });
    return () => {
      mounted = false;
    };
  }, [catalog, workspaceNoteDestination]);
  const repository = createRepositoryApplication({
    catalog,
    navigation,
    session: { status: "absent" },
    systemRepositories,
    systemSessions,
    systems,
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
      application={{ journal, repository, todo, workspace }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

export function AppRoot() {
  const repositoryRuntime = useMemo(
    () => createWorkspaceRepositoryRuntime(),
    [],
  );
  const systemRuntime = useMemo(() => createSystemRepositoryRuntime(), []);
  const catalog = useRepositoryCatalog(
    repositoryRuntime.catalog,
    repositoryRuntime.activeRepositorySelection,
  );
  const systems = useSystemRepositoryCatalog(systemRuntime.catalog);
  const navigation = useRepositoryNavigation();
  const nextWorkspaceNoteRequestIdRef = useRef(1);
  const [workspaceNoteDestination, setWorkspaceNoteDestination] =
    useState<PendingWorkspaceNoteDestination | null>(null);
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const [journalWorkspaceReferenceSnapshot, setJournalWorkspaceReferenceSnapshot] =
    useState<JournalWorkspaceReferenceSnapshotState>({
      generation: 0,
      snapshot: null,
    });
  const journalDescriptor = findSystemDescriptor(systems, "system-journal");
  const todoDescriptor = findSystemDescriptor(systems, "system-todo");
  const journalConnectionKey = createSystemConnectionKey(journalDescriptor);
  const todoConnectionKey = createSystemConnectionKey(todoDescriptor);
  const journalRepository = useMemo(
    () => openSystemRepository(systemRuntime.catalog, journalDescriptor),
    // Descriptor identity is deliberately reduced to storage connection data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journalConnectionKey, systemRuntime.catalog],
  );
  const todoRepository = useMemo(
    () => openSystemRepository(systemRuntime.catalog, todoDescriptor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemRuntime.catalog, todoConnectionKey],
  );
  const journalSession = useSystemRepositorySession({
    purpose: "system-journal",
    repository: journalRepository,
  });
  const todoSession = useSystemRepositorySession({
    purpose: "system-todo",
    repository: todoRepository,
  });
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
      const requestId = nextWorkspaceNoteRequestIdRef.current;

      nextWorkspaceNoteRequestIdRef.current += 1;
      setWorkspaceNoteDestination({ ...destination, requestId });
    },
    [],
  );
  const consumeWorkspaceNoteDestination = useCallback((requestId: number) => {
    setWorkspaceNoteDestination((current) =>
      current?.requestId === requestId ? null : current
    );
  }, []);
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
  const systemRepositories = useMemo(
    () => ({
      ...(journalRepository ? { "system-journal": journalRepository } : {}),
      ...(todoRepository ? { "system-todo": todoRepository } : {}),
    }),
    [journalRepository, todoRepository],
  );
  const systemSessions = useMemo(
    () => ({
      "system-journal": journalSession,
      "system-todo": todoSession,
    }),
    [journalSession, todoSession],
  );
  const common = {
    activeActivityId,
    catalog,
    journal,
    todo,
    navigation,
    onConsumeWorkspaceNoteDestination: consumeWorkspaceNoteDestination,
    onActiveActivityChange: setActiveActivityId,
    onWorkspaceReferenceSnapshotChange:
      updateJournalWorkspaceReferenceSnapshot,
    systemRepositories,
    systemSessions,
    systems,
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
