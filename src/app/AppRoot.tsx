import { useMemo } from "react";
import { useSession } from "../application/workspace/session/useSession";
import { useViewModel } from "../application/workspace/view-model/useViewModel";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import AppView from "../ui/AppView";

export function AppRoot() {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const session = useSession({ repository });
  const view = useViewModel(session);

  return <AppView view={view} />;
}
