import {
  type ParsedWorkspaceNote,
  type WorkspaceParseIndex,
} from "../indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";
import {
  type FolderId,
  type NoteId,
  type NoteTreeNode,
  type WorkspaceNote,
} from "../model/workspaceData";

export function listWorkspaceNotes(
  workspace: WorkspaceStructureIndex,
): WorkspaceNote[] {
  return workspace.data.notes.map((note) => {
    const entry = workspace.noteEntryById.get(note.id);

    if (!entry) {
      throw new Error(`Workspace note is missing from tree: ${note.id}`);
    }

    return entry.projectedNote;
  });
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
  return workspace.noteEntryById.get(noteId)?.projectedNote ?? null;
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
  return workspace.noteEntryById.get(noteId)?.parentFolderId ?? null;
}

export function collectWorkspaceNoteIdsInFolder(
  workspace: WorkspaceStructureIndex,
  folderId: FolderId,
) {
  const folder = workspace.folderEntryById.get(folderId)?.node;

  if (!folder) {
    return [];
  }

  const noteIds: NoteId[] = [];
  const pending = [...folder.children].reverse();

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node) {
      continue;
    }

    if (node.kind === "note") {
      noteIds.push(node.noteId);
      continue;
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }

  return noteIds;
}

export function getParsedWorkspaceNote(
  index: WorkspaceParseIndex,
  noteId: NoteId | null,
): ParsedWorkspaceNote | null {
  return noteId ? index.getParsedNote(noteId) : null;
}
