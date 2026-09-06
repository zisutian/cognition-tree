import { parseWorkspaceRepositoryContent } from "../../../contracts/workspace/index.ts";
import type { WorkspaceRepositoryContent } from "../../../application/workspace/index.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../application/workspace/index.ts";
import type { VersionedContentPreparationPolicy } from "../../../application/persistence/index.ts";

/**
 * Application-owned semantic validation composed at the storage runtime edge.
 * Repository persistence remains CTN-agnostic, while no remote content is admitted
 * to the durable local cache before its canonical metadata can be opened by a
 * workspace session.
 */
export function validateWorkspaceRepositoryContent(
  content: WorkspaceRepositoryContent,
) {
  const parsedContent = parseWorkspaceRepositoryContent(content);

  prepareWorkspaceRepositoryContent(parsedContent);
}

export const workspaceRepositoryPreparation:
  VersionedContentPreparationPolicy<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  > = {
    prepare(content, previous) {
      return prepareWorkspaceRepositoryContent(content, { previous });
    },
  };
