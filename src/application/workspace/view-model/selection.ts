import {
  defaultFolderId,
  type FolderId,
} from "../../../workspace/model/workspaceData";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";

export function resolveFolderSelection(
  workspace: WorkspaceStructureIndex,
  preferredFolderId: FolderId,
) {
  return (
    workspace.folderById.get(preferredFolderId)?.id ??
    workspace.folderById.keys().next().value ??
    defaultFolderId
  );
}
