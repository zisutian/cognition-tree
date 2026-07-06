import {
  createEmptyParsedWorkspaceNote,
  type NoteReferenceGraph,
  type ParsedWorkspaceNote,
  type WorkspaceParseIndex,
} from "../indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
} from "../model/workspaceData";

type WorkspaceNoteSource = WorkspaceStructureIndex;
type WorkspaceTreeSource = WorkspaceStructureIndex;
type WorkspaceNoteSummary = Pick<NoteRecord, "id" | "title">;

export type {
  NoteReferenceGraph,
  NoteReferenceGraphEdge,
  NoteReferenceGraphNode,
  ParsedWorkspaceNote,
  UnresolvedNoteReference,
  WorkspaceParseIndex,
} from "../indexes/workspaceParseIndex";
export type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";

export {
  createWorkspaceParseIndex,
  createWorkspaceParseIndexCache,
} from "../indexes/workspaceParseIndex";
export { createWorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";

export function listWorkspaceNotes(workspace: WorkspaceNoteSource): NoteRecord[] {
  return workspace.data.notes;
}

export function getWorkspaceTree(workspace: WorkspaceTreeSource): NoteTreeNode[] {
  return workspace.data.tree;
}

export function getDefaultWorkspaceFolderId() {
  return defaultFolderId;
}

export function listWorkspaceNoteSummaries(
  workspace: WorkspaceNoteSource,
): WorkspaceNoteSummary[] {
  return workspace.data.notes.map((note) => ({
    id: note.id,
    title: note.title,
  }));
}

export function getWorkspaceNoteCount(workspace: WorkspaceNoteSource) {
  return workspace.data.notes.length;
}

export function findWorkspaceNote(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  return workspace.noteById.get(noteId) ?? null;
}

export function hasWorkspaceNote(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  return findWorkspaceNote(workspace, noteId) !== null;
}

export function getWorkspaceNoteLineCount(
  workspace: WorkspaceNoteSource,
  noteId: NoteId,
) {
  const note = findWorkspaceNote(workspace, noteId);

  return note ? note.source.split("\n").length : null;
}

export function findWorkspaceFolder(
  workspace: WorkspaceTreeSource,
  folderId: FolderId,
) {
  return workspace.folderById.get(folderId) ?? null;
}

export function findWorkspaceFolderIdContainingNote(
  workspace: WorkspaceTreeSource,
  noteId: NoteId,
) {
  return workspace.noteFolderIdById.get(noteId) ?? null;
}

export function countWorkspaceFolders(workspace: WorkspaceTreeSource) {
  return workspace.folderCount;
}

export function collectWorkspaceNoteIdsInFolder(
  workspace: WorkspaceTreeSource,
  folderId: FolderId,
) {
  return workspace.noteIdsByFolderId.get(folderId) ?? [];
}

export function getParsedWorkspaceNote(
  index: WorkspaceParseIndex,
  noteId: NoteId | null,
): ParsedWorkspaceNote {
  if (!noteId) {
    return createEmptyParsedWorkspaceNote(index.syntaxProfile);
  }

  return (
    index.getParsedNote(noteId) ??
    createEmptyParsedWorkspaceNote(index.syntaxProfile)
  );
}

export function getWorkspaceNoteReferenceGraph(
  index: WorkspaceParseIndex,
): NoteReferenceGraph {
  return index.referenceGraph;
}
