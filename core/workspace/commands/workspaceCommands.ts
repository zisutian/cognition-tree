import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../model/noteTree/mutations.ts";
import { createNoteTreeFolderNode } from "../model/noteTree/create.ts";
import { moveNoteTreeNode } from "../model/noteTree/move.ts";
import type { NoteTreeMoveRequest } from "../model/noteTree/types.ts";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex.ts";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
  touchCtnSourceTitleMetadata,
} from "../../ctn/metadata/sourceMetadata.ts";
import { reconcileCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator.ts";
import { readCtnCanonicalTitleHeader } from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types.ts";
import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { parsePortableName } from "../../naming/portableName.ts";
import {
  createNoteRecord,
  createCanonicalNoteSource,
  defaultNoteTitle,
  replaceWorkspaceNoteSources,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../model/workspaceData.ts";

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

function canonicalizeChangedWorkspaceNoteTitle(
  previousTitle: string,
  nextSource: string,
  timestamp: string,
) {
  const nextTitle = readCtnCanonicalTitleHeader(nextSource).title;

  // Existing non-portable titles remain readable and must not prevent body
  // edits. Only a title mutation enters the stricter portable-name boundary.
  if (nextTitle === previousTitle) {
    return nextSource;
  }

  const canonicalTitle = parsePortableName(
    nextTitle,
    "Workspace note title",
  );

  return canonicalTitle === nextTitle
    ? nextSource
    : replaceCtnSourceTitle(nextSource, canonicalTitle, timestamp);
}

export function createWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  {
    parentFolderId,
    noteId,
    reservedBlockIds,
    timestamp,
    syntax,
    createBlockId,
  }: {
    createBlockId: () => string;
    parentFolderId: FolderId | null;
    noteId: NoteId;
    syntax: CtnCompiledSyntax | null;
    timestamp: string;
    reservedBlockIds: ReadonlySet<string>;
  },
): WorkspaceData {
  assertWorkspaceNoteIdAvailable(workspace, noteId);

  if (parentFolderId !== null) {
    assertWorkspaceFolderExists(workspace, parentFolderId);
  }

  const source = syntax
    ? initializeCtnSourceBlockMetadata(defaultNoteTitle, syntax, {
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
  const nextTitle = parsePortableName(title, "Workspace folder title");

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
  const nextTitle = parsePortableName(title, "Workspace folder title");

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
  const nextTitle = parsePortableName(title, "Workspace note title");

  const noteIndex = workspace.noteEntryById.get(noteId)?.noteIndex;

  if (noteIndex === undefined) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const note = workspace.data.notes[noteIndex];
  const source = replaceCtnSourceTitle(note.source, nextTitle, timestamp);

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
  previousAnalysis: CtnCanonicalSourceAnalysis,
  change: CtnEditableSourceChange,
  timestamp: string,
  createBlockId: () => string,
  reservedBlockIds: ReadonlySet<string>,
): {
  analysis: CtnCanonicalSourceAnalysis;
  workspaceData: WorkspaceData;
} {
  assertWorkspaceNoteExists(workspace, noteId);

  const entry = workspace.noteEntryById.get(noteId);

  if (!entry) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const noteIndex = entry.noteIndex;
  const note = workspace.data.notes[noteIndex];

  if (
    previousAnalysis.sourceText.source !== note.source ||
    previousAnalysis.mode.kind !== "canonical-document"
  ) {
    throw new Error(
      `Workspace note analysis is stale: ${noteId}`,
    );
  }
  const syntax = previousAnalysis.syntax;
  const candidateAnalysis = analyzeCtnSource({
    mode: { kind: "editable-document" },
    source: change.source,
    syntax,
  });
  const reconciled = reconcileCtnSourceBlockMetadata(
    previousAnalysis,
    candidateAnalysis,
    change,
    {
      createId: createBlockId,
      reservedIds: reservedBlockIds,
      timestamp,
      touchTitle: true,
    },
  );
  const nextSource = canonicalizeChangedWorkspaceNoteTitle(
    entry.header.title,
    reconciled.source,
    timestamp,
  );
  const analysis = nextSource === reconciled.source
    ? reconciled.analysis
    : analyzeCtnSource({
        mode: { kind: "canonical-document" },
        source: nextSource,
        syntax,
      });

  return {
    analysis,
    workspaceData: replaceWorkspaceNoteSources(workspace.data, [
      { noteId, source: nextSource },
    ]),
  };
}

export function updateWorkspaceRawNoteSource(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
  change: CtnEditableSourceChange,
  timestamp: string,
): WorkspaceData {
  assertWorkspaceNoteExists(workspace, noteId);

  const entry = workspace.noteEntryById.get(noteId);

  if (!entry) {
    throw new Error(`Workspace note does not exist: ${noteId}`);
  }

  const noteIndex = entry.noteIndex;
  const note = workspace.data.notes[noteIndex];

  assertCtnEditableSourceChange(note.source, change);
  if (note.source === change.source) {
    return workspace.data;
  }

  const nextSource = canonicalizeChangedWorkspaceNoteTitle(
    entry.header.title,
    change.source,
    timestamp,
  );

  return replaceWorkspaceNoteSources(workspace.data, [{
    noteId,
    source: touchCtnSourceTitleMetadata(nextSource, timestamp),
  }]);
}
