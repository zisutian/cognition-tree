import type { FolderId, NoteId, NoteTreeNode } from "../workspaceData.ts";

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

export type NoteTreeMoveDestination =
  | {
      kind: "root";
    }
  | {
      folderId: FolderId;
      kind: "inside";
    }
  | {
      kind: "after" | "before";
      target: NoteTreeNodeReference;
    };

export type NoteTreeMoveRequest = {
  destination: NoteTreeMoveDestination;
  source: NoteTreeNodeReference;
};

export type NoteTreeNodeLocation = {
  index: number;
  node: NoteTreeNode;
  parentFolderId: FolderId | null;
};
