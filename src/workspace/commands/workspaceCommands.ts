import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  collectNoteIdsInFolder,
  countFolders,
  createNoteTreeFolderNode,
  findFolderNode,
  moveNoteInWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../model/noteTree";
import {
  createNoteRecord,
  defaultFolderId,
  inferNoteTitle,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type WorkspaceData,
} from "../model/workspaceData";

function hasWorkspaceNote(workspace: WorkspaceData, noteId: NoteId) {
  return workspace.notes.some((note) => note.id === noteId);
}

function assertWorkspaceNoteExists(workspace: WorkspaceData, noteId: NoteId) {
  if (!hasWorkspaceNote(workspace, noteId)) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }
}

function assertWorkspaceFolderExists(
  workspace: WorkspaceData,
  folderId: FolderId,
) {
  if (!findFolderNode(workspace.tree, folderId)) {
    throw new Error(`Workspace folder does not exist: ${folderId}`);
  }
}

function assertWorkspaceNoteIdAvailable(
  workspace: WorkspaceData,
  noteId: NoteId,
) {
  if (hasWorkspaceNote(workspace, noteId)) {
    throw new Error(`Workspace note already exists: ${noteId}`);
  }
}

function assertWorkspaceFolderIdAvailable(
  workspace: WorkspaceData,
  folderId: FolderId,
) {
  if (findFolderNode(workspace.tree, folderId)) {
    throw new Error(`Workspace folder already exists: ${folderId}`);
  }
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
  assertWorkspaceNoteIdAvailable(workspace, noteId);
  assertWorkspaceFolderExists(workspace, folderId);

  const note = createNoteRecord(noteId, "", timestamp);

  return {
    ...workspace,
    notes: [...workspace.notes, note],
    tree: appendNoteToWorkspaceTree(workspace.tree, note.id, folderId),
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
    throw new Error("Workspace folder title is required.");
  }

  assertWorkspaceFolderIdAvailable(workspace, folderId);
  assertWorkspaceFolderExists(workspace, parentFolderId);

  return {
    ...workspace,
    tree: appendFolderToWorkspaceTree(
      workspace.tree,
      createNoteTreeFolderNode(folderId, nextTitle),
      parentFolderId,
    ),
  };
}

export function renameWorkspaceFolder(
  workspace: WorkspaceData,
  folderId: FolderId,
  title: string,
): WorkspaceData {
  const nextTitle = title.trim();

  if (!nextTitle) {
    throw new Error("Workspace folder title is required.");
  }

  assertWorkspaceFolderExists(workspace, folderId);

  return {
    ...workspace,
    tree: renameFolderInWorkspaceTree(workspace.tree, folderId, nextTitle),
  };
}

export function deleteWorkspaceNote(
  workspace: WorkspaceData,
  noteId: NoteId,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const notes = workspace.notes.filter((note) => note.id !== noteId);

  return {
    ...workspace,
    notes,
    tree: removeNoteFromWorkspaceTree(workspace.tree, noteId),
  };
}

export function deleteWorkspaceFolder(
  workspace: WorkspaceData,
  folderId: FolderId,
): WorkspaceData {
  assertWorkspaceFolderExists(workspace, folderId);

  if (folderId === defaultFolderId) {
    throw new Error("Default workspace folder cannot be deleted.");
  }

  if (countFolders(workspace.tree) <= 1) {
    throw new Error("Workspace must contain at least one folder.");
  }

  const removedNoteIds = new Set(
    collectNoteIdsInFolder(workspace.tree, folderId),
  );
  const notes = workspace.notes.filter((note) => !removedNoteIds.has(note.id));

  return {
    ...workspace,
    notes,
    tree: removeFolderFromWorkspaceTree(workspace.tree, folderId),
  };
}

export function moveWorkspaceNote(
  workspace: WorkspaceData,
  noteId: NoteId,
  targetFolderId: FolderId,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);
  assertWorkspaceFolderExists(workspace, targetFolderId);

  return {
    ...workspace,
    tree: moveNoteInWorkspaceTree(workspace.tree, noteId, targetFolderId),
  };
}

export function updateWorkspaceNoteSource(
  workspace: WorkspaceData,
  noteId: NoteId,
  source: string,
  timestamp: string,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  return {
    ...workspace,
    notes: workspace.notes.map((note): NoteRecord => {
      if (note.id !== noteId) {
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
