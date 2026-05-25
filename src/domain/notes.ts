import {
  defaultCtnSyntaxProfile,
  type CtnSyntaxProfile,
} from "../ctn/parseOutline";

export type NoteId = string;

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
      defaultSyntaxProfileId?: string;
      defaultSyntaxVersion?: number;
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
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
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

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder" || node.id !== "folder-inbox") {
      return node;
    }

    return {
      ...node,
      children: [
        ...node.children,
        {
          id: `tree-${noteId}`,
          kind: "note",
          noteId,
        },
      ],
    };
  });
}

export function removeNoteFromWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
): NoteTreeNode[] {
  return tree.flatMap((node): NoteTreeNode[] => {
    if (node.kind === "note") {
      return node.noteId === noteId ? [] : [node];
    }

    return [
      {
        ...node,
        children: removeNoteFromWorkspaceTree(node.children, noteId),
      },
    ];
  });
}

export function resolveNoteSyntaxProfile(
  workspace: NoteWorkspace,
  note: NoteRecord,
): CtnSyntaxProfile {
  return (
    workspace.syntaxProfiles.find(
      (profile) =>
        profile.id === note.syntaxProfileId &&
        profile.version === note.syntaxVersion,
    ) ??
    workspace.syntaxProfiles.find((profile) => profile.id === note.syntaxProfileId) ??
    resolveWorkspaceSyntaxProfile(workspace)
  );
}

export function resolveWorkspaceSyntaxProfile(
  workspace: NoteWorkspace,
): CtnSyntaxProfile {
  return (
    workspace.syntaxProfiles.find(
      (profile) => profile.id === workspace.defaultSyntaxProfileId,
    ) ?? defaultCtnSyntaxProfile
  );
}

export function resolveFolderSyntaxProfile(
  workspace: NoteWorkspace,
  folderId: string,
): CtnSyntaxProfile {
  const folder = findFolderNode(workspace.tree, folderId);

  return (
    workspace.syntaxProfiles.find(
      (profile) =>
        profile.id === folder?.defaultSyntaxProfileId &&
        profile.version === folder.defaultSyntaxVersion,
    ) ??
    workspace.syntaxProfiles.find(
      (profile) => profile.id === folder?.defaultSyntaxProfileId,
    ) ??
    resolveWorkspaceSyntaxProfile(workspace)
  );
}

function findFolderNode(
  tree: NoteTreeNode[],
  folderId: string,
): Extract<NoteTreeNode, { kind: "folder" }> | null {
  for (const node of tree) {
    if (node.kind === "folder") {
      if (node.id === folderId) {
        return node;
      }

      const childFolder = findFolderNode(node.children, folderId);

      if (childFolder) {
        return childFolder;
      }
    }
  }

  return null;
}

export function createInitialWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    defaultSyntaxProfileId: defaultCtnSyntaxProfile.id,
    syntaxProfiles: [defaultCtnSyntaxProfile],
    notes: [],
    tree: [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "未整理",
        defaultSyntaxProfileId: defaultCtnSyntaxProfile.id,
        defaultSyntaxVersion: defaultCtnSyntaxProfile.version,
        children: [],
      },
    ],
  } satisfies NoteWorkspace;
}
