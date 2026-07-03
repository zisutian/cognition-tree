export type NoteId = string;
export type FolderId = string;

export const defaultFolderId: FolderId = "folder-inbox";

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
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  tree: NoteTreeNode[];
};

export function inferNoteTitle(source: string): string {
  return source
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "未命名笔记";
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
    activeNoteId: null,
    notes: [],
    tree: [
      {
        id: defaultFolderId,
        kind: "folder",
        title: "仓库根目录",
        children: [],
      },
    ],
  };
}
