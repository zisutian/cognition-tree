import { createWorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import { createInitialWorkspaceData } from "../../../core/workspace/model/workspaceData";
import { createWorkspaceNote } from "../../../core/workspace/commands/workspaceCommands";
import { createInitialWorkspaceSyntax } from "../../../core/workspace/context/workspaceSyntax";

export function createInitialRepositoryContent({
  createBlockId,
  createNoteId,
  createSyntaxFileId,
  createWorkspaceId,
  name,
  timestamp,
}: {
  createBlockId: () => string;
  createNoteId: () => string;
  createSyntaxFileId: () => string;
  createWorkspaceId: () => string;
  name: string;
  timestamp: string;
}) {
  const workspaceName = name.trim();

  if (!workspaceName) {
    throw new Error("Repository name is required.");
  }

  const syntax = createInitialWorkspaceSyntax();
  const syntaxFileId = createSyntaxFileId();
  const emptyWorkspace = {
    ...createInitialWorkspaceData(),
    id: createWorkspaceId(),
    name: workspaceName,
  };
  const workspace = createWorkspaceNote(
    createWorkspaceStructureIndex(emptyWorkspace),
    {
      createBlockId,
      noteId: createNoteId(),
      parentFolderId: null,
      reservedBlockIds: new Set(),
      syntax: syntax.syntax,
      timestamp,
    },
  );

  return {
    schemaVersion: 4 as const,
    syntax: {
      activeFileId: syntaxFileId,
      files: [{ id: syntaxFileId, source: syntax.source }],
    },
    workspace,
  };
}
