import type { FolderId } from "../../../workspace/model/workspaceData";
import type { UiTreeNodeReference } from "../projection/viewTree";

export function createWorkspaceTreeNodeReference(
  reference: UiTreeNodeReference,
) {
  return reference.kind === "folder"
    ? {
        folderId: reference.folderId as FolderId,
        kind: "folder" as const,
      }
    : {
        kind: "note" as const,
        noteId: reference.noteId,
      };
}
