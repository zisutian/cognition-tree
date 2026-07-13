import type { FolderId } from "../../../workspace/model/workspaceData";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";

export function resolveFolderSelection(
  workspace: WorkspaceStructureIndex,
  preferredFolderId: FolderId | null,
): FolderId | null {
  if (preferredFolderId === null) {
    return null;
  }

  return workspace.folderById.get(preferredFolderId)?.id ?? null;
}
