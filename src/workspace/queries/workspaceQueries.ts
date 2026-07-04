import {
  collectNoteIdsInFolder,
  countFolders,
  findFirstFolderId,
  findFolderIdContainingNote,
  findFolderNode,
  orderNoteTreeNodesFoldersFirst,
} from "../model/noteTree";
import {
  createEmptyParsedWorkspaceNote,
  type NoteReferenceGraph,
  type ParsedWorkspaceNote,
  type WorkspaceIndex,
} from "../index/workspaceIndex";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
  type WorkspaceData,
} from "../model/workspaceData";

type WorkspaceNoteSource = Pick<WorkspaceData, "notes">;
type WorkspaceTreeSource = Pick<WorkspaceData, "tree">;
type WorkspaceReadSource = Pick<
  WorkspaceData,
  "activeNoteId" | "notes" | "tree"
>;
type WorkspaceFolderNode = Extract<NoteTreeNode, { kind: "folder" }>;
type WorkspaceNoteSummary = Pick<NoteRecord, "id" | "title">;

export type {
  NoteReferenceGraph,
  NoteReferenceGraphEdge,
  NoteReferenceGraphNode,
  ParsedWorkspaceNote,
  UnresolvedNoteReference,
  WorkspaceIndex,
} from "../index/workspaceIndex";

export {
  createWorkspaceIndex,
  createWorkspaceIndexCache,
} from "../index/workspaceIndex";

export function listWorkspaceNotes(workspace: WorkspaceNoteSource): NoteRecord[] {
  return workspace.notes;
}

export function getWorkspaceTree(workspace: WorkspaceTreeSource): NoteTreeNode[] {
  return workspace.tree;
}

export function getDefaultWorkspaceFolderId() {
  return defaultFolderId;
}

export function listWorkspaceNoteSummaries(
  workspace: WorkspaceNoteSource,
): WorkspaceNoteSummary[] {
  return workspace.notes.map((note) => ({
    id: note.id,
    title: note.title,
  }));
}

export function getWorkspaceNoteCount(workspace: WorkspaceNoteSource) {
  return workspace.notes.length;
}

export function findWorkspaceNote(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  return workspace.notes.find((note) => note.id === noteId) ?? null;
}

export function hasWorkspaceNote(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  return findWorkspaceNote(workspace, noteId) !== null;
}

export function getWorkspaceNoteLineCount(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  const note = findWorkspaceNote(workspace, noteId);

  return note ? note.source.split("\n").length : null;
}

export function findActiveWorkspaceNote(workspace: WorkspaceReadSource) {
  return workspace.activeNoteId
    ? findWorkspaceNote(workspace, workspace.activeNoteId)
    : null;
}

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

export function findWorkspaceFolder(
  workspace: WorkspaceTreeSource,
  folderId: FolderId,
) {
  return findFolderNode(workspace.tree, folderId);
}

export function findFirstWorkspaceFolderId(workspace: WorkspaceTreeSource) {
  return findFirstFolderId(workspace.tree);
}

export function findWorkspaceFolderIdContainingNote(
  workspace: WorkspaceTreeSource,
  noteId: NoteId,
) {
  return findFolderIdContainingNote(workspace.tree, noteId);
}

export function countWorkspaceFolders(workspace: WorkspaceTreeSource) {
  return countFolders(workspace.tree);
}

export function collectWorkspaceNoteIdsInFolder(
  workspace: WorkspaceTreeSource,
  folderId: FolderId,
) {
  return collectNoteIdsInFolder(workspace.tree, folderId);
}

export function resolveExistingWorkspaceFolderId(
  workspace: WorkspaceTreeSource,
  preferredFolderId: FolderId,
) {
  return (
    findWorkspaceFolder(workspace, preferredFolderId)?.id ??
    findFirstWorkspaceFolderId(workspace) ??
    defaultFolderId
  );
}

export function getParsedWorkspaceNote(
  index: WorkspaceIndex,
  noteId: NoteId | null,
): ParsedWorkspaceNote {
  if (!noteId) {
    return createEmptyParsedWorkspaceNote(index.syntaxProfile);
  }

  return (
    index.parsedNotesById.get(noteId) ??
    createEmptyParsedWorkspaceNote(index.syntaxProfile)
  );
}

export function getWorkspaceNoteReferenceGraph(
  index: WorkspaceIndex,
): NoteReferenceGraph {
  return index.referenceGraph;
}
