import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  moveNoteInWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../model/noteTree/mutations";
import { createNoteTreeFolderNode } from "../model/noteTree/create";
import { moveNoteTreeNode } from "../model/noteTree/move";
import type { NoteTreeMoveRequest } from "../model/noteTree/types";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
import {
  createNoteRecord,
  defaultNoteTitle,
  inferNoteTitle,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../model/workspaceData";

function hasWorkspaceNote(workspace: WorkspaceStructureIndex, noteId: NoteId) {
  return workspace.noteById.has(noteId);
}

function assertWorkspaceNoteExists(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  if (!hasWorkspaceNote(workspace, noteId)) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }
}

function assertWorkspaceFolderExists(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
) {
  if (!workspace.folderById.has(folderId)) {
    throw new Error(`Workspace folder does not exist: ${folderId}`);
  }
}

function assertWorkspaceNoteIdAvailable(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  if (hasWorkspaceNote(workspace, noteId)) {
    throw new Error(`Workspace note already exists: ${noteId}`);
  }
}

function assertWorkspaceFolderIdAvailable(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
) {
  if (workspace.folderById.has(folderId)) {
    throw new Error(`Workspace folder already exists: ${folderId}`);
  }
}

function replaceTitleLine(source: string, title: string) {
  const lines = source.split("\n");

  lines[0] = title;
  return lines.join("\n");
}

export function createWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  {
    parentFolderId,
    noteId,
    timestamp,
  }: {
    parentFolderId: FolderId | null;
    noteId: NoteId;
    timestamp: string;
  },
): WorkspaceData {
  assertWorkspaceNoteIdAvailable(workspace, noteId);

  if (parentFolderId !== null) {
    assertWorkspaceFolderExists(workspace, parentFolderId);
  }

  const note = createNoteRecord(noteId, defaultNoteTitle, timestamp);

  return {
    ...workspace.data,
    notes: [...workspace.data.notes, note],
    tree: appendNoteToWorkspaceTree(
      workspace.data.tree,
      note.id,
      parentFolderId,
    ),
  };
}

export function createWorkspaceFolder(
  workspace: WorkspaceStructureIndex,
  {
    folderId,
    parentFolderId,
    title,
  }: {
    folderId: FolderId;
    parentFolderId: FolderId | null;
    title: string;
  },
): WorkspaceData {
  const nextTitle = title.trim();

  if (!nextTitle) {
    throw new Error("Workspace folder title is required.");
  }

  assertWorkspaceFolderIdAvailable(workspace, folderId);

  if (parentFolderId !== null) {
    assertWorkspaceFolderExists(workspace, parentFolderId);
  }

  return {
    ...workspace.data,
    tree: appendFolderToWorkspaceTree(
      workspace.data.tree,
      createNoteTreeFolderNode(folderId, nextTitle),
      parentFolderId,
    ),
  };
}

export function renameWorkspaceFolder(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
  title: string,
): WorkspaceData {
  const nextTitle = title.trim();

  if (!nextTitle) {
    throw new Error("Workspace folder title is required.");
  }

  assertWorkspaceFolderExists(workspace, folderId);

  return {
    ...workspace.data,
    tree: renameFolderInWorkspaceTree(workspace.data.tree, folderId, nextTitle),
  };
}

export function renameWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
  title: string,
  timestamp: string,
): WorkspaceData {
  const nextTitle = title.trim();

  if (!nextTitle) {
    throw new Error("Workspace note title is required.");
  }

  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteIndexById.get(noteId);

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const notes = [...workspace.data.notes];
  const note = notes[noteIndex];
  const source = replaceTitleLine(note.source, nextTitle);

  notes[noteIndex] = {
    ...note,
    source,
    title: inferNoteTitle(source),
    updatedAt: timestamp,
  };

  return {
    ...workspace.data,
    notes,
  };
}

export function deleteWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const notes = workspace.data.notes.filter((note) => note.id !== noteId);

  return {
    ...workspace.data,
    notes,
    tree: removeNoteFromWorkspaceTree(workspace.data.tree, noteId),
  };
}

export function deleteWorkspaceFolder(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
): WorkspaceData {
  assertWorkspaceFolderExists(workspace, folderId);

  const removedNoteIds = new Set(workspace.noteIdsByFolderId.get(folderId));
  const notes = workspace.data.notes.filter(
    (note) => !removedNoteIds.has(note.id),
  );

  return {
    ...workspace.data,
    notes,
    tree: removeFolderFromWorkspaceTree(workspace.data.tree, folderId),
  };
}

export function moveWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
  targetFolderId: FolderId | null,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  if (targetFolderId !== null) {
    assertWorkspaceFolderExists(workspace, targetFolderId);
  }

  return {
    ...workspace.data,
    tree: moveNoteInWorkspaceTree(
      workspace.data.tree,
      noteId,
      targetFolderId,
    ),
  };
}

export function moveWorkspaceTreeNode(
  workspace: WorkspaceStructureIndex,
  request: NoteTreeMoveRequest,
): WorkspaceData {
  return {
    ...workspace.data,
    tree: moveNoteTreeNode(workspace.data.tree, request),
  };
}

export function updateWorkspaceNoteSource(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
  source: string,
  timestamp: string,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteIndexById.get(noteId);

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const notes = [...workspace.data.notes];
  const note = notes[noteIndex];

  notes[noteIndex] = {
    ...note,
    source,
    title: inferNoteTitle(source),
    updatedAt: timestamp,
  };

  return {
    ...workspace.data,
    notes,
  };
}
