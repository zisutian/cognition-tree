import { useMemo, useState } from "react";
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
  navigation,
  onActiveActivityChange,
  session,
  systemRepositories,
  systemSessions,
  systems,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onActiveActivityChange: (activityId: ActivityId) => void;
  session: ActiveSession;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
}) {
  const workspace = useWorkspaceApplication(session);
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
        repository,
        workspace: { application: workspace, status: "ready" },
      }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

function RepositoryWorkspaceApp({
  activeActivityId,
  catalog,
  navigation,
  onActiveActivityChange,
  systemRepositories,
  systemSessions,
  systems,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onActiveActivityChange: (activityId: ActivityId) => void;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
}) {
  const repository = catalog.repository;

  if (!repository) {
    throw new Error("Active repository disappeared before session mount.");
  }
  const session = useSession({ repository });

  if (session.status === "ready") {
    return (
      <ReadyWorkspaceWorkbench
        activeActivityId={activeActivityId}
        catalog={catalog}
        navigation={navigation}
        onActiveActivityChange={onActiveActivityChange}
        session={session}
        systemRepositories={systemRepositories}
        systemSessions={systemSessions}
        systems={systems}
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
      application={{ repository: repositoryApplication, workspace: sessionState }}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

function EmptyWorkspaceApp({
  activeActivityId,
  catalog,
  navigation,
  onActiveActivityChange,
  systemRepositories,
  systemSessions,
  systems,
}: {
  activeActivityId: ActivityId;
  catalog: RepositoryCatalogApplication;
  navigation: ReturnType<typeof useRepositoryNavigation>;
  onActiveActivityChange: (activityId: ActivityId) => void;
  systemRepositories: RepositoryApplication["systems"]["repositories"];
  systemSessions: RepositoryApplication["systems"]["sessions"];
  systems: SystemCatalogApplication;
}) {
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
      application={{ repository, workspace }}
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
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
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
    navigation,
    onActiveActivityChange: setActiveActivityId,
    systemRepositories,
    systemSessions,
    systems,
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
