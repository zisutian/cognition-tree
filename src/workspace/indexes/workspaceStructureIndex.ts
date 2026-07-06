import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
} from "../model/workspaceData";
import type { NoteTreeFolderNode } from "../model/noteTree/types";

export type WorkspaceStructureIndex = {
  data: WorkspaceData;
  folderById: Map<FolderId, NoteTreeFolderNode>;
  folderCount: number;
  noteById: Map<NoteId, NoteRecord>;
  noteFolderIdById: Map<NoteId, FolderId>;
  noteIdsByFolderId: Map<FolderId, NoteId[]>;
  noteIndexById: Map<NoteId, number>;
};

function createNoteById(notes: NoteRecord[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

function createNoteIndexById(notes: NoteRecord[]) {
  return new Map(notes.map((note, index) => [note.id, index]));
}

function indexNoteTreeNodes({
  folderById,
  node,
  noteFolderIdById,
  noteIdsByFolderId,
  parentFolderId,
}: {
  folderById: Map<FolderId, NoteTreeFolderNode>;
  node: NoteTreeNode;
  noteFolderIdById: Map<NoteId, FolderId>;
  noteIdsByFolderId: Map<FolderId, NoteId[]>;
  parentFolderId: FolderId | null;
}): NoteId[] {
  if (node.kind === "note") {
    if (parentFolderId) {
      noteFolderIdById.set(node.noteId, parentFolderId);
    }

    return [node.noteId];
  }

  folderById.set(node.id, node);

  const noteIds = node.children.flatMap((child) =>
    indexNoteTreeNodes({
      folderById,
      node: child,
      noteFolderIdById,
      noteIdsByFolderId,
      parentFolderId: node.id,
    }),
  );

  noteIdsByFolderId.set(node.id, noteIds);
  return noteIds;
}

export function createWorkspaceStructureIndex(
  data: WorkspaceData,
): WorkspaceStructureIndex {
  const folderById = new Map<FolderId, NoteTreeFolderNode>();
  const noteFolderIdById = new Map<NoteId, FolderId>();
  const noteIdsByFolderId = new Map<FolderId, NoteId[]>();

  data.tree.forEach((node) =>
    indexNoteTreeNodes({
      folderById,
      node,
      noteFolderIdById,
      noteIdsByFolderId,
      parentFolderId: null,
    }),
  );

  return {
    data,
    folderById,
    folderCount: folderById.size,
    noteById: createNoteById(data.notes),
    noteFolderIdById,
    noteIdsByFolderId,
    noteIndexById: createNoteIndexById(data.notes),
  };
}
