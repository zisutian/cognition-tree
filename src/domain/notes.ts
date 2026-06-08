import type { CtnSyntaxProfile } from "../syntax/types";

export type NoteId = string;
export type FolderId = string;

export const defaultFolderId: FolderId = "folder-inbox";

export type NoteRecord = {
  id: NoteId;
  title: string;
  source: string;
  syntaxProfileId: string;
  syntaxVersion: number;
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

export type NoteWorkspace = {
  id: string;
  name: string;
  activeNoteId: NoteId | null;
  defaultSyntaxProfileId: string;
  syntaxProfiles: CtnSyntaxProfile[];
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
  syntaxProfile: CtnSyntaxProfile,
): NoteRecord {
  return {
    id,
    title: inferNoteTitle(source),
    source,
    syntaxProfileId: syntaxProfile.id,
    syntaxVersion: syntaxProfile.version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createInitialWorkspace(syntaxProfiles: CtnSyntaxProfile[] = []) {
  return createWorkspaceWithSyntaxProfiles(syntaxProfiles);
}

export function createWorkspaceWithSyntaxProfiles(
  syntaxProfiles: CtnSyntaxProfile[],
) {
  const defaultSyntaxProfile = syntaxProfiles[0] ?? null;

  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    defaultSyntaxProfileId: defaultSyntaxProfile?.id ?? "",
    syntaxProfiles,
    notes: [],
    tree: [
      {
        id: defaultFolderId,
        kind: "folder",
        title: "仓库根目录",
        children: [],
      },
    ],
  } satisfies NoteWorkspace;
}
