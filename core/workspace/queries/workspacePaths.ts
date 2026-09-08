// SPDX-License-Identifier: GPL-3.0-or-later

import type { NoteTreeNode } from "../model/workspaceData.ts";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex.ts";

export type WorkspaceResourcePath = {
  id: string;
  kind: "folder" | "note";
  name: string;
  path: string;
};

export function listWorkspaceResourcePaths(
  index: WorkspaceStructureIndex,
): WorkspaceResourcePath[] {
  const result: WorkspaceResourcePath[] = [];
  const pending: Array<{ node: NoteTreeNode; parent: string }> = index.data.tree
    .slice()
    .reverse()
    .map((node) => ({ node, parent: "" }));
  while (pending.length > 0) {
    const { node, parent } = pending.pop()!;
    if (node.kind === "folder") {
      const path = parent ? `${parent}/${node.title}` : node.title;
      result.push({
        id: node.folderId,
        kind: "folder",
        name: node.title,
        path,
      });
      for (const child of node.children.slice().reverse())
        pending.push({ node: child, parent: path });
    } else {
      const entry = index.noteEntryById.get(node.noteId);
      if (!entry) throw new Error("Prepared tree refers to a missing note.");
      result.push({
        id: node.noteId,
        kind: "note",
        name: entry.header.title,
        path: parent ? `${parent}/${entry.header.title}` : entry.header.title,
      });
    }
  }
  return result;
}
