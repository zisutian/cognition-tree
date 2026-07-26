import { parseWorkspaceRepositoryContent } from "../../contracts/workspace/parseRepository";
import type { WorkspaceRepositoryContent } from "../../application/repository/workspaceRepository";
import { resolveWorkspaceSyntax } from "../../core/workspace/context/workspaceSyntax";
import { validateWorkspaceTitleBlockMetadata } from "../../core/workspace/context/workspaceBlockMetadata";
import { createWorkspaceParseIndex } from "../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../core/workspace/indexes/workspaceStructureIndex";
import { normalizeWorkspaceSyntaxName } from "../../application/repository/workspaceRepository";

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
  const syntaxById = new Map(
    parsedContent.syntax.files.map((file) => [
      file.id,
      resolveWorkspaceSyntax(file.source),
    ]),
  );
  const syntaxNames = new Set<string>();

  for (const workspaceSyntax of syntaxById.values()) {
    if (!workspaceSyntax) {
      throw new Error("Repository syntax file source cannot be empty");
    }
    const name = normalizeWorkspaceSyntaxName(
      workspaceSyntax.syntax.name,
    );
    if (syntaxNames.has(name)) {
      throw new Error(`Duplicate repository syntax name: ${name}`);
    }
    syntaxNames.add(name);
  }
  const activeSyntaxFile = parsedContent.syntax.activeFileId === null
    ? null
    : parsedContent.syntax.files.find(
        ({ id }) => id === parsedContent.syntax.activeFileId,
      ) ?? null;
  const workspaceSyntax = activeSyntaxFile
    ? syntaxById.get(activeSyntaxFile.id) ?? null
    : null;
  const workspace = createWorkspaceStructureIndex(parsedContent.workspace);

  if (workspaceSyntax) {
    createWorkspaceParseIndex({
      syntax: workspaceSyntax.syntax,
      workspace,
    });
  } else {
    validateWorkspaceTitleBlockMetadata(parsedContent.workspace);
  }
}
