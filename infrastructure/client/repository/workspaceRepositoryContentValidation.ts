import { parseWorkspaceRepositoryContent } from "../../../contracts/workspace/parseRepository";
import type { WorkspaceRepositoryContent } from "../../../application/repository/workspaceRepository";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../application/repository/workspaceRepositoryPreparation";
import type { VersionedContentPreparationPolicy } from "../../../application/persistence/versionedRepository";

/**
 * Application-owned semantic validation composed at the storage runtime edge.
 * Repository adapters remain CTN-agnostic, while no remote content is admitted
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
