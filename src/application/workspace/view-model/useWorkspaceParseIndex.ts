import { useMemo, useState } from "react";
import { createWorkspaceParseIndexCache } from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceParseIndex } from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";

export function useWorkspaceParseIndex(
  workspace: WorkspaceContext | null,
): WorkspaceParseIndex | null {
  const [indexCache] = useState(createWorkspaceParseIndexCache);
  const index = useMemo(
    () => (workspace ? indexCache.resolve(workspace) : null),
    [indexCache, workspace],
  );

  return index;
}
