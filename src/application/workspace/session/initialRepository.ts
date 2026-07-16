import { createWorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import { createInitialWorkspaceData } from "../../../workspace/model/workspaceData";
import { createWorkspaceNote } from "../../../workspace/commands/workspaceCommands";
import { createDefaultWorkspaceSyntax } from "../../../workspace/context/workspaceSyntax";

export function createInitialRepositoryContent({
  createBlockId,
  createNoteId,
  name,
  repositoryId,
  timestamp,
}: {
  createBlockId: () => string;
  createNoteId: () => string;
  name: string;
  repositoryId: string;
  timestamp: string;
}) {
  const workspaceName = name.trim();

  if (!workspaceName) {
    throw new Error("Repository name is required.");
  }

  const syntax = createDefaultWorkspaceSyntax();
  const emptyWorkspace = {
    ...createInitialWorkspaceData(),
    id: `workspace-${repositoryId}`,
    name: workspaceName,
  };
  const workspace = createWorkspaceNote(
    createWorkspaceStructureIndex(emptyWorkspace),
    {
      createBlockId,
      noteId: createNoteId(),
      parentFolderId: null,
      reservedBlockIds: new Set(),
      syntaxProfile: syntax.profile,
      timestamp,
    },
  );

  return {
    schemaVersion: 3 as const,
    syntaxSource: syntax.source,
    workspace,
  };
}
