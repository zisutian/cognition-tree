import { createWorkspaceRepositorySyntaxSourceFile } from "../../../storage/workspaceRepository";
import { createWorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import {
  createInitialWorkspaceData,
} from "../../../workspace/model/workspaceData";
import { createWorkspaceNote } from "../../../workspace/commands/workspaceCommands";
import { createDefaultWorkspaceSyntax } from "../../../workspace/context/workspaceSyntax";

export function createInitialRepositoryContent({
  createBlockId,
  createNoteId = () => `note-${globalThis.crypto.randomUUID()}`,
  name,
  repositoryId,
  timestamp = new Date().toISOString(),
}: {
  createBlockId?: () => string;
  createNoteId?: () => string;
  name: string;
  repositoryId: string;
  timestamp?: string;
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
      syntaxProfile: syntax.profile,
      timestamp,
    },
  );

  return {
    syntaxSourceFile: createWorkspaceRepositorySyntaxSourceFile(syntax.source),
    workspace,
  };
}
