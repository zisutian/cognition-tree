import { inferCtnSourceTitle } from "../../ctn/metadata/sourceMetadata";

export type NoteId = string;
export type FolderId = string;

export type NoteRecord = {
  id: NoteId;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteTreeNode =
  | {
      id: string;
      kind: "folder";
      title: string;
      children: NoteTreeNode[];
    }
  | {
      id: string;
      kind: "note";
      noteId: NoteId;
    };

export type WorkspaceData = {
  id: string;
  name: string;
  notes: NoteRecord[];
  tree: NoteTreeNode[];
};

export const defaultNoteTitle = "未命名笔记";

export function inferNoteTitle(source: string): string {
  return inferCtnSourceTitle(source);
}

export function createNoteRecord(
  id: NoteId,
  source: string,
  timestamp: string,
): NoteRecord {
  return {
    id,
    title: inferNoteTitle(source),
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createInitialWorkspaceData(): WorkspaceData {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [],
  };
}
