import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../model/noteTree/mutations";
import { createNoteTreeFolderNode } from "../model/noteTree/create";
import { moveNoteTreeNode } from "../model/noteTree/move";
import type { NoteTreeMoveRequest } from "../model/noteTree/types";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
} from "../../ctn/metadata/sourceMetadata";
import { reconcileCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
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

export function createWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  {
    parentFolderId,
    noteId,
    timestamp,
    syntaxProfile,
    createBlockId,
  }: {
    createBlockId?: () => string;
    parentFolderId: FolderId | null;
    noteId: NoteId;
    syntaxProfile: CtnSyntaxProfile | null;
    timestamp: string;
  },
): WorkspaceData {
  assertWorkspaceNoteIdAvailable(workspace, noteId);

  if (parentFolderId !== null) {
    assertWorkspaceFolderExists(workspace, parentFolderId);
  }

  const source = syntaxProfile
    ? initializeCtnSourceBlockMetadata(defaultNoteTitle, syntaxProfile, {
        createdAt: timestamp,
        createId: createBlockId,
        updatedAt: timestamp,
      })
    : defaultNoteTitle;
  const note = createNoteRecord(noteId, source, timestamp);

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
  const source = replaceCtnSourceTitle(note.source, nextTitle, timestamp);

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
  syntaxProfile: CtnSyntaxProfile | null,
  createBlockId?: () => string,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteIndexById.get(noteId);

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const notes = [...workspace.data.notes];
  const note = notes[noteIndex];
  const nextSource = syntaxProfile
    ? reconcileCtnSourceBlockMetadata(note.source, source, syntaxProfile, {
        createId: createBlockId,
        timestamp,
      })
    : source;

  notes[noteIndex] = {
    ...note,
    source: nextSource,
    title: inferNoteTitle(nextSource),
    updatedAt: timestamp,
  };

  return {
    ...workspace.data,
    notes,
  };
}
