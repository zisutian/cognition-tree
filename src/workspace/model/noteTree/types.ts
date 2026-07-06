import type { FolderId, NoteId, NoteTreeNode } from "../workspaceData";

export type NoteTreeFolderNode = Extract<NoteTreeNode, { kind: "folder" }>;
export type NoteTreeNoteNode = Extract<NoteTreeNode, { kind: "note" }>;

export type NoteTreeNodeReference =
  | {
      folderId: FolderId;
      kind: "folder";
    }
  | {
      kind: "note";
      noteId: NoteId;
    };

export type NoteTreeMovePlacement = "after" | "before" | "inside";

export type NoteTreeMoveRequest = {
  placement: NoteTreeMovePlacement;
  source: NoteTreeNodeReference;
  target: NoteTreeNodeReference;
};

export type NoteTreeNodeLocation = {
  index: number;
  node: NoteTreeNode;
  parentFolderId: FolderId | null;
};
