import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../model/noteTree/mutations.ts";
import { createNoteTreeFolderNode } from "../model/noteTree/create.ts";
import { moveNoteTreeNodes } from "../model/noteTree/move.ts";
import { findFolderNode, getNoteTreeNodeReferenceId } from "../model/noteTree/query.ts";
import type { NoteTreeBatchMoveRequest, NoteTreeMoveRequest } from "../model/noteTree/types.ts";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex.ts";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
  touchCtnSourceTitleMetadata,
  reconcileCtnSourceBlockMetadata,
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
  createCtnBlockIdAllocator,
  readCtnCanonicalTitleHeader,
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/index.ts";




import type { CtnCompiledSyntax } from "../../ctn/index.ts";

import { createPortableNameKey, parsePortableName } from "../../naming/index.ts";
import {
  createNoteRecord,
  createCanonicalNoteSource,
  defaultNoteTitle,
  replaceWorkspaceNoteSources,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../model/workspaceData.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../errors/index.ts";

function hasWorkspaceNote(workspace: WorkspaceStructureIndex, noteId: NoteId) {
  return workspace.noteEntryById.has(noteId);
}

function assertWorkspaceNoteExists(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  if (!hasWorkspaceNote(workspace, noteId)) {
    throw new DomainNotFoundError(
      noteId,
      `Workspace note does not exist: ${noteId}`,
    );
  }
}

function assertWorkspaceFolderExists(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
) {
  if (!workspace.folderEntryById.has(folderId)) {
    throw new DomainNotFoundError(
      folderId,
      `Workspace folder does not exist: ${folderId}`,
    );
  }
}

function assertWorkspaceNoteIdAvailable(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  if (hasWorkspaceNote(workspace, noteId)) {
    throw new DomainValidationError(
      `Workspace note already exists: ${noteId}`,
    );
  }
}

function assertWorkspaceFolderIdAvailable(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
) {
  if (workspace.folderEntryById.has(folderId)) {
    throw new DomainValidationError(
      `Workspace folder already exists: ${folderId}`,
    );
  }
}

function collectSiblingNameKeys(
  workspace: WorkspaceStructureIndex,
  parentFolderId: FolderId | null,
  exceptNoteId?: NoteId,
) {
  const names = new Map<string, "note" | "folder">();

  for (const [siblingId, entry] of workspace.noteEntryById) {
    if (
      siblingId !== exceptNoteId &&
      entry.parentFolderId === parentFolderId
    ) {
      names.set(createPortableNameKey(entry.header.title), "note");
    }
  }
  for (const entry of workspace.folderEntryById.values()) {
    if (entry.parentFolderId === parentFolderId) {
      const key = createPortableNameKey(entry.node.title);

      if (!names.has(key)) names.set(key, "folder");
    }
  }
  return names;
}

function assertNoteSiblingNameAvailable(
  workspace: WorkspaceStructureIndex,
  parentFolderId: FolderId | null,
  title: string,
  exceptNoteId: NoteId,
) {
  const conflict = collectSiblingNameKeys(
    workspace,
    parentFolderId,
    exceptNoteId,
  ).get(createPortableNameKey(title));

  if (conflict) {
    throw new DomainValidationError(
      conflict === "note"
        ? "同一文件夹中已存在同名笔记。"
        : "同一文件夹中已存在同名文件夹。",
    );
  }
}

export function findAvailableDefaultNoteTitle(
  workspace: WorkspaceStructureIndex,
  parentFolderId: FolderId | null,
) {
  if (parentFolderId !== null) {
    assertWorkspaceFolderExists(workspace, parentFolderId);
  }
  const occupied = collectSiblingNameKeys(workspace, parentFolderId);

  for (let index = 0; index <= occupied.size; index += 1) {
    const title = index === 0 ? defaultNoteTitle : `${defaultNoteTitle}${index}`;

    if (!occupied.has(createPortableNameKey(title))) return title;
  }
  throw new Error("Unable to allocate an untitled note name.");
}

function canonicalizeChangedWorkspaceNoteTitle(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
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
  assertNoteSiblingNameAvailable(
    workspace,
    workspace.noteEntryById.get(noteId)?.parentFolderId ?? null,
    canonicalTitle,
    noteId,
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
  const title = findAvailableDefaultNoteTitle(workspace, parentFolderId);
  const source = syntax
    ? initializeCtnSourceBlockMetadata(title, syntax, {
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
        title,
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
  assertNoteSiblingNameAvailable(
    workspace,
    workspace.noteEntryById.get(noteId)?.parentFolderId ?? null,
    nextTitle,
    noteId,
  );

  const noteIndex = workspace.noteEntryById.get(noteId)?.noteIndex;

  if (noteIndex === undefined) {
    throw new DomainNotFoundError(
      noteId,
      `Workspace note does not exist: ${noteId}`,
    );
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
    throw new DomainNotFoundError(
      folderId,
      `Workspace folder does not exist: ${folderId}`,
    );
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
  return moveWorkspaceTreeNodes(workspace, {
    destination: request.destination,
    sources: [request.source],
  });
}

export function moveWorkspaceTreeNodes(
  workspace: WorkspaceStructureIndex,
  request: NoteTreeBatchMoveRequest,
): WorkspaceData {
  const tree = moveNoteTreeNodes(workspace.data.tree, request);
  const destination = request.destination;
  const parentFolderId = destination.kind === "root"
    ? null
    : destination.kind === "inside"
      ? destination.folderId
      : destination.target.kind === "folder"
        ? workspace.folderEntryById.get(destination.target.folderId)!.parentFolderId
        : workspace.noteEntryById.get(destination.target.noteId)!.parentFolderId;
  const siblings = parentFolderId === null ? tree : findFolderNode(tree, parentFolderId)!.children;
  const selected = new Set(request.sources.map((source) => `${source.kind}:${getNoteTreeNodeReferenceId(source)}`));
  const moved = siblings.filter((node) => selected.has(`${node.kind}:${getNoteTreeNodeReferenceId(node)}`));
  const names = new Map<string, "folder" | "note">();
  const titleOf = (node: typeof siblings[number]) => node.kind === "folder"
    ? node.title
    : workspace.noteEntryById.get(node.noteId)!.header.title;
  for (const node of siblings) {
    if (!selected.has(`${node.kind}:${getNoteTreeNodeReferenceId(node)}`)) {
      names.set(createPortableNameKey(titleOf(node)), node.kind);
    }
  }
  for (const node of moved) {
    const title = parsePortableName(titleOf(node), "Workspace tree node title");
    const key = createPortableNameKey(title);
    const conflict = names.get(key);
    if (conflict) {
      throw new DomainValidationError(conflict === "note"
        ? "同一文件夹中已存在同名笔记。"
        : "同一文件夹中已存在同名文件夹。");
    }
    names.set(key, node.kind);
  }
  if (tree === workspace.data.tree) return workspace.data;
  return {
    ...workspace.data,
    tree,
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
    throw new DomainNotFoundError(
      noteId,
      `Workspace note does not exist: ${noteId}`,
    );
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
    workspace,
    noteId,
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
    throw new DomainNotFoundError(
      noteId,
      `Workspace note does not exist: ${noteId}`,
    );
  }

  const noteIndex = entry.noteIndex;
  const note = workspace.data.notes[noteIndex];

  assertCtnEditableSourceChange(note.source, change);
  if (note.source === change.source) {
    return workspace.data;
  }

  const nextSource = canonicalizeChangedWorkspaceNoteTitle(
    workspace,
    noteId,
    entry.header.title,
    change.source,
    timestamp,
  );

  return replaceWorkspaceNoteSources(workspace.data, [{
    noteId,
    source: touchCtnSourceTitleMetadata(nextSource, timestamp),
  }]);
}
