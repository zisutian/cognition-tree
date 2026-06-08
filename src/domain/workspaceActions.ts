import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  collectNoteIdsInFolder,
  countFolders,
  createFolderTreeNode,
  findFirstFolderId,
  findFolderNode,
  moveNoteInWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "./noteTree";
import {
  createNoteRecord,
  defaultFolderId,
  inferNoteTitle,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "./notes";
import type { CtnSyntaxProfile } from "../syntax/types";

export function resolveExistingFolderId(
  workspace: NoteWorkspace,
  preferredFolderId: FolderId,
) {
  return (
    findFolderNode(workspace.tree, preferredFolderId)?.id ??
    findFirstFolderId(workspace.tree) ??
    defaultFolderId
  );
}

export function selectWorkspaceNote(
  workspace: NoteWorkspace,
  noteId: NoteId,
): NoteWorkspace {
  if (!workspace.notes.some((note) => note.id === noteId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeNoteId: noteId,
  };
}

export function createWorkspaceNote(
  workspace: NoteWorkspace,
  {
    folderId,
    noteId,
    syntaxProfile,
    timestamp,
  }: {
    folderId: FolderId;
    noteId: NoteId;
    syntaxProfile: CtnSyntaxProfile;
    timestamp: string;
  },
): NoteWorkspace {
  const targetFolderId = resolveExistingFolderId(workspace, folderId);
  const note = createNoteRecord(noteId, "", timestamp, syntaxProfile);

  return {
    ...workspace,
    activeNoteId: note.id,
    notes: [...workspace.notes, note],
    tree: appendNoteToWorkspaceTree(workspace.tree, note.id, targetFolderId),
  };
}

export function createWorkspaceFolder(
  workspace: NoteWorkspace,
  {
    folderId,
    parentFolderId,
    title,
  }: {
    folderId: FolderId;
    parentFolderId: FolderId;
    title: string;
  },
): NoteWorkspace {
  const nextTitle = title.trim();

  if (!nextTitle) {
    return workspace;
  }

  const targetFolderId = resolveExistingFolderId(workspace, parentFolderId);

  return {
    ...workspace,
    tree: appendFolderToWorkspaceTree(
      workspace.tree,
      createFolderTreeNode(folderId, nextTitle),
      targetFolderId,
    ),
  };
}

export function renameWorkspaceFolder(
  workspace: NoteWorkspace,
  folderId: FolderId,
  title: string,
): NoteWorkspace {
  const nextTitle = title.trim();

  if (!nextTitle || !findFolderNode(workspace.tree, folderId)) {
    return workspace;
  }

  return {
    ...workspace,
    tree: renameFolderInWorkspaceTree(workspace.tree, folderId, nextTitle),
  };
}

export function deleteWorkspaceNote(
  workspace: NoteWorkspace,
  noteId: NoteId,
): NoteWorkspace {
  const notes = workspace.notes.filter((note) => note.id !== noteId);

  if (notes.length === workspace.notes.length) {
    return workspace;
  }

  return {
    ...workspace,
    activeNoteId:
      workspace.activeNoteId === noteId
        ? (notes[0]?.id ?? null)
        : workspace.activeNoteId,
    notes,
    tree: removeNoteFromWorkspaceTree(workspace.tree, noteId),
  };
}

export function deleteWorkspaceFolder(
  workspace: NoteWorkspace,
  folderId: FolderId,
): NoteWorkspace {
  if (
    folderId === defaultFolderId ||
    countFolders(workspace.tree) <= 1 ||
    !findFolderNode(workspace.tree, folderId)
  ) {
    return workspace;
  }

  const removedNoteIds = new Set(collectNoteIdsInFolder(workspace.tree, folderId));
  const notes = workspace.notes.filter((note) => !removedNoteIds.has(note.id));

  return {
    ...workspace,
    activeNoteId:
      workspace.activeNoteId && removedNoteIds.has(workspace.activeNoteId)
        ? (notes[0]?.id ?? null)
        : workspace.activeNoteId,
    notes,
    tree: removeFolderFromWorkspaceTree(workspace.tree, folderId),
  };
}

export function moveWorkspaceNote(
  workspace: NoteWorkspace,
  noteId: NoteId,
  targetFolderId: FolderId,
): NoteWorkspace {
  if (!workspace.notes.some((note) => note.id === noteId)) {
    return workspace;
  }

  const nextTargetFolderId = resolveExistingFolderId(workspace, targetFolderId);

  return {
    ...workspace,
    tree: moveNoteInWorkspaceTree(workspace.tree, noteId, nextTargetFolderId),
  };
}

export function updateActiveWorkspaceNoteSource(
  workspace: NoteWorkspace,
  source: string,
  timestamp: string,
): NoteWorkspace {
  if (!workspace.activeNoteId) {
    return workspace;
  }

  return {
    ...workspace,
    notes: workspace.notes.map((note): NoteRecord => {
      if (note.id !== workspace.activeNoteId) {
        return note;
      }

      return {
        ...note,
        source,
        title: inferNoteTitle(source),
        updatedAt: timestamp,
      };
    }),
  };
}

export function updateActiveWorkspaceNoteSyntaxProfile(
  workspace: NoteWorkspace,
  syntaxProfileId: string,
  syntaxVersion: number,
  timestamp: string,
): NoteWorkspace {
  if (!workspace.activeNoteId) {
    return workspace;
  }

  const syntaxProfile = workspace.syntaxProfiles.find(
    (profile) =>
      profile.id === syntaxProfileId && profile.version === syntaxVersion,
  );

  if (!syntaxProfile) {
    return workspace;
  }

  return {
    ...workspace,
    notes: workspace.notes.map((note): NoteRecord => {
      if (note.id !== workspace.activeNoteId) {
        return note;
      }

      return {
        ...note,
        syntaxProfileId: syntaxProfile.id,
        syntaxVersion: syntaxProfile.version,
        updatedAt: timestamp,
      };
    }),
  };
}
