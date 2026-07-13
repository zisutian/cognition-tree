import { useMemo, useState } from "react";
import { useSession } from "../application/workspace/session/useSession";
import {
  useViewModel,
  type WorkspaceViewModelScope,
} from "../application/workspace/view-model/useViewModel";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import type { ActivityId } from "../ui/activityTypes";
import AppView from "../ui/AppView";

function createWorkspaceViewModelScope(
  activeActivityId: ActivityId,
): WorkspaceViewModelScope {
  return {
    notes: activeActivityId === "notes",
    structureOperation: activeActivityId === "structure-operation",
    visualization: activeActivityId === "visualization",
  };
}

export function AppRoot() {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const session = useSession({ repository });
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");
  const viewModelScope = useMemo(
    () => createWorkspaceViewModelScope(activeActivityId),
    [activeActivityId],
  );
  const view = useViewModel(session, viewModelScope);

  return (
    <AppView
      activeActivityId={activeActivityId}
      view={view}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}
