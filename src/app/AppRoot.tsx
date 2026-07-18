import { useMemo, useState } from "react";
import {
  useSession,
  type ActiveSession,
} from "../application/workspace/session/useSession";
import { useWorkspaceApplication } from "../application/workspace/runtime/useWorkspaceApplication";
import { createWorkspaceRepositoryRuntime } from "../storage/runtime/workspaceRepositoryRuntime";
import { useRepositoryCatalog } from "../application/workspace/session/useRepositoryCatalog";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
} from "../application/workspace/session/useRepositoryCatalog";
import type { ActivityId } from "../ui/activityTypes";
import { RepositorySetupView } from "../ui/RepositorySetupView";
import { SessionStateView } from "../ui/SessionStateView";
import { WorkspaceWorkbench } from "./workbench/WorkspaceWorkbench";
import type {
  WorkspaceRepository,
} from "../storage/repository/workspaceRepository";
import {
  projectRepositoryAdapterOptions,
  projectRepositoryIssues,
} from "../application/workspace/activities/settings/settingsViewModel";

type RepositoryCatalogRuntime = ReturnType<typeof useRepositoryCatalog>;

function ActiveWorkspaceApp({
  activeActivityId,
  repositoryManagement,
  session,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  repositoryManagement: Parameters<typeof useWorkspaceApplication>[1];
  session: ActiveSession;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const application = useWorkspaceApplication(session, repositoryManagement);

  return (
    <WorkspaceWorkbench
      activeActivityId={activeActivityId}
      application={application}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

function RepositoryWorkspaceApp({
  catalog,
  repository,
}: {
  catalog: RepositoryCatalogRuntime;
  repository: WorkspaceRepository;
}) {
  const session = useSession({ repository });
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");

  if (session.status === "loading") {
    return (
      <SessionStateView
        status="loading"
        storageLabel={session.storageLabel}
      />
    );
  }

  if (session.status === "failed") {
    return (
      <SessionStateView
        errorMessage={session.errorMessage}
        status="failed"
        storageLabel={session.storageLabel}
        onRetry={() => void session.retry()}
      />
    );
  }

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
  const readyCatalog = catalog.state.status === "ready"
    ? catalog.state
    : null;

  return (
    <ActiveWorkspaceApp
      activeActivityId={activeActivityId}
      repositoryManagement={{
        activeRepositoryId: catalog.activeDescriptor?.id ?? "",
        creatableAdapters: readyCatalog?.creatableAdapters ?? [],
        createRepository,
        deleteRepository,
        issues: readyCatalog?.issues ?? [],
        operation: readyCatalog?.operation ?? "idle",
        refreshRepositories,
        repositories: readyCatalog?.repositories ?? [],
        selectRepository,
      }}
      session={session}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}

export function AppRoot() {
  const repositoryRuntime = useMemo(
    () => createWorkspaceRepositoryRuntime(),
    [],
  );
  const catalog = useRepositoryCatalog(
    repositoryRuntime.catalog,
    repositoryRuntime.activeRepositorySelection,
  );

  if (catalog.state.status === "loading") {
    return (
      <SessionStateView
        status="loading"
        storageLabel={catalog.catalogLabel}
      />
    );
  }

  if (catalog.state.status === "failed") {
    return (
      <SessionStateView
        errorMessage={catalog.state.errorMessage}
        onRetry={() => void catalog.reload()}
        status="failed"
        storageLabel={catalog.catalogLabel}
      />
    );
  }

  if (!catalog.repository) {
    const readyCatalog = catalog.state;

    return (
      <RepositorySetupView
        adapters={projectRepositoryAdapterOptions(
          readyCatalog.creatableAdapters,
        )}
        catalogLabel={catalog.catalogLabel}
        issues={projectRepositoryIssues(readyCatalog.issues)}
        operation={readyCatalog.operation}
        onCreate={async (input) => {
          await catalog.createRepository(input);
        }}
        onDelete={catalog.deleteRepository}
        onRefresh={catalog.reload}
      />
    );
  }

  return (
    <RepositoryWorkspaceApp
      catalog={catalog}
      key={catalog.activeDescriptor?.id}
      repository={catalog.repository}
    />
  );
}
