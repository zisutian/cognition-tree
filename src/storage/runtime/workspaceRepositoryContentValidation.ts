import { parseWorkspaceRepositoryContent } from "../../../contracts/workspace-repository/parseRepository";
import type { WorkspaceRepositoryContent } from "../repository/workspaceRepository";
import { resolveWorkspaceSyntax } from "../../workspace/context/workspaceSyntax";
import { validateWorkspaceBlockMetadata } from "../../workspace/context/workspaceBlockMetadata";
import { createWorkspaceStructureIndex } from "../../workspace/indexes/workspaceStructureIndex";

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
  const workspaceSyntax = resolveWorkspaceSyntax(parsedContent.syntaxSource);

  validateWorkspaceBlockMetadata(
    parsedContent.workspace,
    workspaceSyntax?.profile ?? null,
  );
  createWorkspaceStructureIndex(parsedContent.workspace);
}
