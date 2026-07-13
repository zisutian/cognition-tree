import { useMemo, useState } from "react";
import { createWorkspaceParseIndexCache } from "../../../workspace/queries/workspaceQueries";
import type {
  WorkspaceParseIndex,
} from "../../../workspace/queries/workspaceQueries";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";
import type { WorkspaceParseIndexCache } from "../../../workspace/indexes/workspaceParseIndex";

export function useWorkspaceParseIndexCache() {
  const [indexCache] = useState(createWorkspaceParseIndexCache);

  return indexCache;
}

export function useWorkspaceParseIndex(
  indexCache: WorkspaceParseIndexCache,
  workspace: WorkspaceContext | null,
): WorkspaceParseIndex | null {
  const index = useMemo(
    () => (workspace ? indexCache.resolve(workspace) : null),
    [indexCache, workspace],
  );

  return index;
}
