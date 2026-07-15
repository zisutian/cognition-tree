import type { FolderId } from "../../../workspace/model/workspaceData";
import type {
  UiTreeMoveDestination,
  UiTreeNodeReference,
} from "../projection/viewTree";

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

export function createWorkspaceTreeMoveDestination(
  destination: UiTreeMoveDestination,
) {
  if (destination.kind === "root") {
    return destination;
  }

  if (destination.kind === "inside") {
    return {
      folderId: destination.folderId as FolderId,
      kind: destination.kind,
    };
  }

  return {
    kind: destination.kind,
    target: createWorkspaceTreeNodeReference(destination.target),
  };
}
