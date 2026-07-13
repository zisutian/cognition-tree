import {
  createEmptyParsedWorkspaceNote,
  type NoteReferenceGraph,
  type ParsedWorkspaceNote,
  type WorkspaceParseIndex,
} from "../indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
import {
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
} from "../model/workspaceData";

export function listWorkspaceNotes(
  workspace: WorkspaceStructureIndex,
): NoteRecord[] {
  return workspace.data.notes;
}

export function getWorkspaceTree(
  workspace: WorkspaceStructureIndex,
): NoteTreeNode[] {
  return workspace.data.tree;
}

export function findWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  return workspace.noteById.get(noteId) ?? null;
}

export function hasWorkspaceNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  return findWorkspaceNote(workspace, noteId) !== null;
}

export function findWorkspaceFolderIdContainingNote(
  workspace: WorkspaceStructureIndex,
  noteId: NoteId,
) {
  return workspace.noteFolderIdById.get(noteId) ?? null;
}

export function collectWorkspaceNoteIdsInFolder(
  workspace: WorkspaceStructureIndex,
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
