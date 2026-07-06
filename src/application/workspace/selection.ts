import {
  findFirstFolderId,
  findFolderNode,
} from "../../workspace/model/noteTree";
import {
  defaultFolderId,
  type FolderId,
  type WorkspaceData,
} from "../../workspace/model/workspaceData";

type TreeSource = Pick<WorkspaceData, "tree">;

export function resolveFolderSelection(
  workspace: TreeSource,
  preferredFolderId: FolderId,
) {
  return (
    findFolderNode(workspace.tree, preferredFolderId)?.id ??
    findFirstFolderId(workspace.tree) ??
    defaultFolderId
  );
}
