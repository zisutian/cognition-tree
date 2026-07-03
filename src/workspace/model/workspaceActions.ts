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
  type WorkspaceData,
} from "./workspaceData";

export function resolveExistingFolderId(
  workspace: WorkspaceData,
  preferredFolderId: FolderId,
) {
  return (
    findFolderNode(workspace.tree, preferredFolderId)?.id ??
    findFirstFolderId(workspace.tree) ??
    defaultFolderId
  );
}

export function selectWorkspaceNote(
  workspace: WorkspaceData,
  noteId: NoteId,
): WorkspaceData {
  if (!workspace.notes.some((note) => note.id === noteId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeNoteId: noteId,
  };
}

export function createWorkspaceNote(
  workspace: WorkspaceData,
  {
    folderId,
    noteId,
    timestamp,
  }: {
    folderId: FolderId;
    noteId: NoteId;
    timestamp: string;
  },
): WorkspaceData {
  const targetFolderId = resolveExistingFolderId(workspace, folderId);
  const note = createNoteRecord(noteId, "", timestamp);

  return {
    ...workspace,
    activeNoteId: note.id,
    notes: [...workspace.notes, note],
    tree: appendNoteToWorkspaceTree(workspace.tree, note.id, targetFolderId),
  };
}

export function createWorkspaceFolder(
  workspace: WorkspaceData,
  {
    folderId,
    parentFolderId,
    title,
  }: {
    folderId: FolderId;
    parentFolderId: FolderId;
    title: string;
  },
): WorkspaceData {
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
  workspace: WorkspaceData,
  folderId: FolderId,
  title: string,
): WorkspaceData {
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
  workspace: WorkspaceData,
  noteId: NoteId,
): WorkspaceData {
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
  workspace: WorkspaceData,
  folderId: FolderId,
): WorkspaceData {
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
  workspace: WorkspaceData,
  noteId: NoteId,
  targetFolderId: FolderId,
): WorkspaceData {
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
  workspace: WorkspaceData,
  source: string,
  timestamp: string,
): WorkspaceData {
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
