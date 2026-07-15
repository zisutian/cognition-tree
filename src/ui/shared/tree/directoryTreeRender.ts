import type {
  Dispatch,
  SetStateAction,
} from "react";
import type { ContextMenuPosition } from "../ContextMenu";
import type {
  NoteTreeProps,
  TreeDragState,
  TreeNode,
} from "./types";

export type DirectoryTreeEditingNode = {
  key: string;
  title: string;
};

export type DirectoryTreeRenderContext = {
  dragState: TreeDragState | null;
  editingNode: DirectoryTreeEditingNode | null;
  pendingDeleteNode: TreeNode | null;
  props: NoteTreeProps;
  rootNodes: TreeNode[];
  runAction: (action: () => void) => void;
  setContextMenuNode: Dispatch<SetStateAction<TreeNode | null>>;
  setContextMenuPosition: Dispatch<
    SetStateAction<ContextMenuPosition | null>
  >;
  setDragState: Dispatch<SetStateAction<TreeDragState | null>>;
  setEditingNode: Dispatch<SetStateAction<DirectoryTreeEditingNode | null>>;
  setPendingDeleteNode: Dispatch<SetStateAction<TreeNode | null>>;
};

export function isActiveDirectoryTreeNode(
  activeNode: NoteTreeProps["activeNode"],
  node: TreeNode,
) {
  if (node.kind === "note" && activeNode?.kind === "note") {
    return node.noteId === activeNode.noteId;
  }

  return node.kind === "folder" && activeNode?.kind === "folder"
    ? node.folderId === activeNode.folderId
    : false;
}
