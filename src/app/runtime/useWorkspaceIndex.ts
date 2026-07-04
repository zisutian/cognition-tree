import { useMemo, useState } from "react";
import { createWorkspaceIndexCache } from "../../workspace/queries/workspaceQueries";
import type { WorkspaceRuntime } from "../../workspace/runtime/workspaceRuntime";

export function useWorkspaceIndex(workspace: WorkspaceRuntime) {
  const [indexCache] = useState(createWorkspaceIndexCache);
  const index = useMemo(
    () => indexCache.resolve(workspace),
    [indexCache, workspace],
  );

  return index;
}
