import type { FolderId, NoteId } from "../workspaceData";
import type { NoteTreeFolderNode, NoteTreeNoteNode } from "./types";

export function createNoteTreeNoteNode(noteId: NoteId): NoteTreeNoteNode {
  return {
    id: `tree-${noteId}`,
    kind: "note",
    noteId,
  };
}

export function createNoteTreeFolderNode(
  folderId: FolderId,
  title: string,
): NoteTreeFolderNode {
  return {
    id: folderId,
    kind: "folder",
    title,
    children: [],
  };
}
