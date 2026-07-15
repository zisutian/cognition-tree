import { useMemo, useState } from "react";
import {
  useSession,
  type ActiveSession,
} from "../application/workspace/session/useSession";
import { useWorkspaceApplication } from "../application/workspace/runtime/useWorkspaceApplication";
import { createRuntimeWorkspaceRepositoryCatalog } from "../storage/runtimeWorkspaceRepository";
import { useRepositoryCatalog } from "../application/workspace/session/useRepositoryCatalog";
import type { ActivityId } from "../ui/activityTypes";
import { RepositorySetupView } from "../ui/RepositorySetupView";
import { SessionStateView } from "../ui/SessionStateView";
import { WorkspaceActivities } from "./activities/WorkspaceActivities";
import type {
  WorkspaceRepository,
} from "../storage/workspaceRepository";

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
    <WorkspaceActivities
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
    catalog.selectRepository(repositoryId);
  };
  const createRepository = async (input: { id: string; name: string }) => {
    await session.flushPendingChanges();
    await catalog.createRepository(input);
  };

  return (
    <ActiveWorkspaceApp
      activeActivityId={activeActivityId}
      repositoryManagement={{
        activeRepositoryId: catalog.activeDescriptor?.id ?? "",
        createRepository,
        repositories:
          catalog.state.status === "ready" ? catalog.state.repositories : [],
        selectRepository,
      }}
      session={session}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}

export function AppRoot() {
  const repositoryCatalog = useMemo(
    () => createRuntimeWorkspaceRepositoryCatalog(),
    [],
  );
  const catalog = useRepositoryCatalog(repositoryCatalog);

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
    return (
      <RepositorySetupView
        catalogLabel={catalog.catalogLabel}
        onCreate={async (input) => {
          await catalog.createRepository(input);
        }}
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
