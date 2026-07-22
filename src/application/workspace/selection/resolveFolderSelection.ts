import type { FolderId } from "../../../../core/workspace/model/workspaceData";
import type { WorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";

export function resolveFolderSelection(
  workspace: WorkspaceStructureIndex,
  preferredFolderId: FolderId | null,
): FolderId | null {
  if (preferredFolderId === null) {
    return null;
  }

  return workspace.folderEntryById.has(preferredFolderId)
    ? preferredFolderId
    : null;
}
