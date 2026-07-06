import { useMemo, useState } from "react";
import { createWorkspaceIndexCache } from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceIndex } from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";

export function useWorkspaceIndex(
  workspace: WorkspaceContext | null,
): WorkspaceIndex | null {
  const [indexCache] = useState(createWorkspaceIndexCache);
  const index = useMemo(
    () => (workspace ? indexCache.resolve(workspace) : null),
    [indexCache, workspace],
  );

  return index;
}
