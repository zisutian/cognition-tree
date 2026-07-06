import { useMemo } from "react";
import { useSession } from "../application/workspace/useSession";
import { useViewModel } from "../application/workspace/useViewModel";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import AppView from "../ui/AppView";

export function AppRoot() {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const session = useSession({ repository });
  const view = useViewModel(session);

  return <AppView view={view} />;
}
