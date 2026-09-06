import type {
  FolderId,
  WorkspaceStructureIndex,
} from "../../../core/workspace/index.ts";


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
