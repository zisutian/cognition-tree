import type { CtnSyntaxProfile } from "../ctn/parseOutline";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";

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

export type SyntaxProfileResolution =
  | {
      status: "resolved";
      profile: CtnSyntaxProfile;
    }
  | {
      status: "missing-profile";
      message: string;
      syntaxProfileId: string;
      syntaxVersion?: number;
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

export function resolveNoteSyntaxProfile(
  workspace: NoteWorkspace,
  note: NoteRecord,
): SyntaxProfileResolution {
  const profile = workspace.syntaxProfiles.find(
    (candidate) =>
      candidate.id === note.syntaxProfileId &&
      candidate.version === note.syntaxVersion,
  );

  if (profile) {
    return { status: "resolved", profile };
  }

  return {
    status: "missing-profile",
    message: `笔记引用的语法 ${note.syntaxProfileId}@${note.syntaxVersion} 不存在。`,
    syntaxProfileId: note.syntaxProfileId,
    syntaxVersion: note.syntaxVersion,
  };
}

export function resolveWorkspaceSyntaxProfile(
  workspace: NoteWorkspace,
): SyntaxProfileResolution {
  const profile = workspace.syntaxProfiles.find(
    (candidate) => candidate.id === workspace.defaultSyntaxProfileId,
  );

  if (profile) {
    return { status: "resolved", profile };
  }

  return {
    status: "missing-profile",
    message: `仓库默认语法 ${workspace.defaultSyntaxProfileId} 不存在。`,
    syntaxProfileId: workspace.defaultSyntaxProfileId,
  };
}

export function createInitialWorkspace() {
  const syntaxProfiles = [defaultCtnSyntaxProfile];

  return createWorkspaceWithSyntaxProfiles(syntaxProfiles);
}

export function createWorkspaceWithSyntaxProfiles(
  syntaxProfiles: CtnSyntaxProfile[],
) {
  const defaultSyntaxProfile =
    syntaxProfiles.find((profile) => profile.id === defaultCtnSyntaxProfile.id) ??
    syntaxProfiles[0] ??
    defaultCtnSyntaxProfile;

  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    defaultSyntaxProfileId: defaultSyntaxProfile.id,
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
