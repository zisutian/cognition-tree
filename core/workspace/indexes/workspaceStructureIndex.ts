import type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
  WorkspaceNote,
  WorkspaceNoteHeader,
  WorkspaceData,
} from "../model/workspaceData.ts";
import { readWorkspaceNoteHeader } from "../model/workspaceData.ts";
import type { NoteTreeFolderNode } from "../model/noteTree/types.ts";

export type WorkspaceTreePath = {
  readonly index: number;
  readonly parent: WorkspaceTreePath | null;
};

export type WorkspaceNoteEntry = {
  header: WorkspaceNoteHeader;
  note: NoteRecord;
  noteIndex: number;
  parentFolderId: FolderId | null;
  path: WorkspaceTreePath;
  projectedNote: WorkspaceNote;
};

export type WorkspaceFolderEntry = {
  node: NoteTreeFolderNode;
  parentFolderId: FolderId | null;
  path: WorkspaceTreePath;
};

export type WorkspaceStructureIndex = {
  data: WorkspaceData;
  folderEntryById: ReadonlyMap<FolderId, WorkspaceFolderEntry>;
  noteEntryById: ReadonlyMap<NoteId, WorkspaceNoteEntry>;
};

type PendingTreeNode = {
  node: NoteTreeNode;
  parentFolderId: FolderId | null;
  path: WorkspaceTreePath;
};

export function createWorkspaceStructureIndex(
  data: WorkspaceData,
): WorkspaceStructureIndex {
  const notesById = new Map<
    NoteId,
    { header: WorkspaceNoteHeader; note: NoteRecord; noteIndex: number }
  >();

  data.notes.forEach((note, noteIndex) => {
    if (notesById.has(note.id)) {
      throw new Error(`Duplicate workspace note id: ${note.id}`);
    }

    notesById.set(note.id, {
      header: readWorkspaceNoteHeader(note),
      note,
      noteIndex,
    });
  });

  const folderEntryById = new Map<FolderId, WorkspaceFolderEntry>();
  const noteEntryById = new Map<NoteId, WorkspaceNoteEntry>();
  const pending: PendingTreeNode[] = [];

  for (let index = data.tree.length - 1; index >= 0; index -= 1) {
    pending.push({
      node: data.tree[index],
      parentFolderId: null,
      path: { index, parent: null },
    });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    const { node, parentFolderId, path } = current;

    if (node.kind === "note") {
      const noteEntry = notesById.get(node.noteId);

      if (!noteEntry) {
        throw new Error(`Workspace tree references unknown note: ${node.noteId}`);
      }
      if (noteEntryById.has(node.noteId)) {
        throw new Error(`Workspace tree places note more than once: ${node.noteId}`);
      }

      noteEntryById.set(node.noteId, {
        ...noteEntry,
        parentFolderId,
        path,
        projectedNote: { ...noteEntry.note, ...noteEntry.header },
      });
      continue;
    }

    if (folderEntryById.has(node.folderId)) {
      throw new Error(`Duplicate workspace folder id: ${node.folderId}`);
    }

    folderEntryById.set(node.folderId, { node, parentFolderId, path });

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        node: node.children[index],
        parentFolderId: node.folderId,
        path: { index, parent: path },
      });
    }
  }

  for (const noteId of notesById.keys()) {
    if (!noteEntryById.has(noteId)) {
      throw new Error(`Workspace note is missing from tree: ${noteId}`);
    }
  }

  return { data, folderEntryById, noteEntryById };
}
