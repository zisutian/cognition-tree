import type { FolderId, NoteId } from "../workspaceData.ts";
import type { NoteTreeFolderNode, NoteTreeNoteNode } from "./types.ts";

export function createNoteTreeNoteNode(noteId: NoteId): NoteTreeNoteNode {
  return {
    kind: "note",
    noteId,
  };
}

export function createNoteTreeFolderNode(
  folderId: FolderId,
  title: string,
): NoteTreeFolderNode {
  return {
    folderId,
    kind: "folder",
    title,
    children: [],
  };
}
