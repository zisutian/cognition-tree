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
  touchCtnSourceTitleMetadata,
} from "../../../ctn/metadata/sourceMetadata";
import { reconcileCtnSourceBlockMetadata } from "../../../ctn/metadata/reconcileSourceMetadata";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../../ctn/metadata/textEdits";
import { createCtnBlockIdAllocator } from "../../../ctn/metadata/blockIdAllocator";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import {
  createNoteRecord,
  createCanonicalNoteSource,
  defaultNoteTitle,
  replaceWorkspaceNoteSources,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../model/workspaceData";

function hasWorkspaceNote(workspace: WorkspaceStructureIndex, noteId: NoteId) {
  return workspace.noteEntryById.has(noteId);
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
  if (!workspace.folderEntryById.has(folderId)) {
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
  if (workspace.folderEntryById.has(folderId)) {
    throw new Error(`Workspace folder already exists: ${folderId}`);
  }
}

export function createWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  {
    parentFolderId,
    noteId,
    reservedBlockIds,
    timestamp,
    syntaxProfile,
    createBlockId,
  }: {
    createBlockId: () => string;
    parentFolderId: FolderId | null;
    noteId: NoteId;
    syntaxProfile: CtnSyntaxProfile | null;
    timestamp: string;
    reservedBlockIds: ReadonlySet<string>;
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
        reservedIds: reservedBlockIds,
        updatedAt: timestamp,
      })
    : createCanonicalNoteSource({
        blockId: createCtnBlockIdAllocator(
          createBlockId,
          reservedBlockIds,
        ).allocate(),
        timestamp,
        title: defaultNoteTitle,
      });
  const note = createNoteRecord(noteId, source);

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
  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteEntryById.get(noteId)?.noteIndex;

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const note = workspace.data.notes[noteIndex];
  const source = replaceCtnSourceTitle(note.source, title, timestamp);

  return replaceWorkspaceNoteSources(workspace.data, [{ noteId, source }]);
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

  const folder = workspace.folderEntryById.get(folderId)?.node;

  if (!folder) {
    throw new Error(`Workspace folder does not exist: ${folderId}`);
  }

  const removedNoteIds = new Set<NoteId>();
  const pending = [...folder.children];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node) {
      continue;
    }

    if (node.kind === "note") {
      removedNoteIds.add(node.noteId);
      continue;
    }

    pending.push(...node.children);
  }
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
  change: CtnEditableSourceChange,
  timestamp: string,
  syntaxProfile: CtnSyntaxProfile,
  createBlockId: () => string,
  reservedBlockIds: ReadonlySet<string>,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteEntryById.get(noteId)?.noteIndex;

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const note = workspace.data.notes[noteIndex];
  const nextSource = reconcileCtnSourceBlockMetadata(
    note.source,
    change,
    syntaxProfile,
    {
      createId: createBlockId,
      reservedIds: reservedBlockIds,
      timestamp,
    },
  );

  return replaceWorkspaceNoteSources(workspace.data, [
    { noteId, source: nextSource },
  ]);
}

export function updateWorkspaceRawNoteSource(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
  change: CtnEditableSourceChange,
  timestamp: string,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const noteIndex = workspace.noteEntryById.get(noteId)?.noteIndex;

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const note = workspace.data.notes[noteIndex];

  assertCtnEditableSourceChange(note.source, change);
  if (note.source === change.source) {
    return workspace.data;
  }

  return replaceWorkspaceNoteSources(workspace.data, [{
    noteId,
    source: touchCtnSourceTitleMetadata(change.source, timestamp),
  }]);
}
