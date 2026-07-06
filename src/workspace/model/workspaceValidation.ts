import {
  defaultFolderId,
  type NoteTreeNode,
  type WorkspaceData,
} from "./workspaceData";
import { findFolderNode } from "./noteTree/query";

export function validateWorkspaceData(workspace: WorkspaceData) {
  const noteIds = new Set(workspace.notes.map((note) => note.id));
  const treeNodeIds = new Set<string>();
  const treeNoteIds = new Set<string>();

  if (!findFolderNode(workspace.tree, defaultFolderId)) {
    throw new Error("Invalid response at $.tree: missing default folder");
  }

  const visit = (node: NoteTreeNode) => {
    if (treeNodeIds.has(node.id)) {
      throw new Error(`Invalid response at $.tree: duplicate node ${node.id}`);
    }

    treeNodeIds.add(node.id);

    if (node.kind === "note" && !noteIds.has(node.noteId)) {
      throw new Error(`Invalid response at $.tree: unknown note ${node.noteId}`);
    }

    if (node.kind === "note") {
      if (treeNoteIds.has(node.noteId)) {
        throw new Error(
          `Invalid response at $.tree: duplicate note node ${node.noteId}`,
        );
      }

      treeNoteIds.add(node.noteId);
    }

    if (node.kind === "folder") {
      node.children.forEach(visit);
    }
  };

  workspace.tree.forEach(visit);
}
