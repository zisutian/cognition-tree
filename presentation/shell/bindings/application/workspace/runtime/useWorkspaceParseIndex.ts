import { useMemo, useState } from "react";
import type {
  WorkspaceParseIndex,
  WorkspaceParseIndexCache,
} from "../../../../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceParseIndexCache } from "../../../../../../core/workspace/indexes/workspaceParseIndex";
import type { WorkspaceContext } from "../../../../../../core/workspace/context/workspaceContext";

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
