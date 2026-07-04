import { orderNoteTreeNodesFoldersFirst } from "../../workspace/model/noteTree";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
} from "../../workspace/model/workspaceData";

type WorkspaceFolderNode = Extract<NoteTreeNode, { kind: "folder" }>;

export function orderWorkspaceTreeNodesFoldersFirst(nodes: NoteTreeNode[]) {
  return orderNoteTreeNodesFoldersFirst(nodes);
}

export function getWorkspaceFolderDisplayTitle(
  folderId: FolderId,
  title: string,
) {
  return folderId === defaultFolderId ? "仓库根目录" : title;
}

export function getWorkspaceFolderChildCount(folder: WorkspaceFolderNode) {
  return folder.children.length;
}

export function hasWorkspaceFolderChildren(folder: WorkspaceFolderNode) {
  return getWorkspaceFolderChildCount(folder) > 0;
}

function collectWorkspaceTreeNoteIds(
  nodes: NoteTreeNode[],
  noteIds = new Set<NoteId>(),
  visitedNodeIds = new Set<string>(),
) {
  nodes.forEach((node) => {
    if (visitedNodeIds.has(node.id)) {
      return;
    }

    visitedNodeIds.add(node.id);

    if (node.kind === "note") {
      noteIds.add(node.noteId);
      return;
    }

    collectWorkspaceTreeNoteIds(node.children, noteIds, visitedNodeIds);
  });

  return noteIds;
}

export function createWorkspaceNoteSelectionTree(
  notes: Pick<NoteRecord, "id">[],
  noteTree: NoteTreeNode[],
) {
  const treeNoteIds = collectWorkspaceTreeNoteIds(noteTree);
  const orphanNoteNodes: NoteTreeNode[] = notes
    .filter((note) => !treeNoteIds.has(note.id))
    .map((note) => ({
      id: `workspace-orphan-${note.id}`,
      kind: "note",
      noteId: note.id,
    }));

  return orphanNoteNodes.length > 0
    ? [...noteTree, ...orphanNoteNodes]
    : noteTree;
}
