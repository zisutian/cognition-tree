import { useMemo, useState } from "react";
import {
  useSession,
  type ActiveSession,
} from "../application/workspace/session/useSession";
import {
  useViewModel,
  type WorkspaceViewModelScope,
} from "../application/workspace/view-model/useViewModel";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import type { ActivityId } from "../ui/activityTypes";
import AppView from "../ui/AppView";
import { SessionStateView } from "../ui/SessionStateView";

function createWorkspaceViewModelScope(
  activeActivityId: ActivityId,
): WorkspaceViewModelScope {
  return {
    notes: activeActivityId === "notes",
    structureOperation: activeActivityId === "structure-operation",
    visualization: activeActivityId === "visualization",
  };
}

function ActiveWorkspaceApp({
  activeActivityId,
  session,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  session: ActiveSession;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const viewModelScope = useMemo(
    () => createWorkspaceViewModelScope(activeActivityId),
    [activeActivityId],
  );
  const view = useViewModel(session, viewModelScope);

  return (
    <AppView
      activeActivityId={activeActivityId}
      view={view}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

export function AppRoot() {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
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

  return (
    <ActiveWorkspaceApp
      activeActivityId={activeActivityId}
      session={session}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}
