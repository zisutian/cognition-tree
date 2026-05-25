import {
  defaultCtnSyntaxProfile,
  type CtnSyntaxProfile,
} from "../ctn/parseOutline";

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
  folderId: FolderId = defaultFolderId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id !== folderId) {
      return {
        ...node,
        children: appendNoteToWorkspaceTree(node.children, noteId, folderId),
      };
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

export function findFolderIdContainingNote(
  tree: NoteTreeNode[],
  noteId: NoteId,
): FolderId | null {
  for (const node of tree) {
    if (node.kind !== "folder") {
      continue;
    }

    if (
      node.children.some(
        (child) => child.kind === "note" && child.noteId === noteId,
      )
    ) {
      return node.id;
    }

    const childFolderId = findFolderIdContainingNote(node.children, noteId);

    if (childFolderId) {
      return childFolderId;
    }
  }

  return null;
}

export function findFirstFolderId(tree: NoteTreeNode[]): FolderId | null {
  for (const node of tree) {
    if (node.kind !== "folder") {
      continue;
    }

    return node.id;
  }

  return null;
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

export function findFolderNode(
  tree: NoteTreeNode[],
  folderId: FolderId,
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
        id: defaultFolderId,
        kind: "folder",
        title: "未整理",
        children: [],
      },
    ],
  } satisfies NoteWorkspace;
}
