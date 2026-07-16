import {
  formatCtnBlockMetadataLine,
} from "../../ctn/metadata/blockMetadata";
import { readCtnCanonicalTitleHeader } from "../../ctn/parser/parseCtnDocument";

export type NoteId = string;
export type FolderId = string;

export type NoteRecord = {
  id: NoteId;
  source: string;
};

export type WorkspaceNoteHeader = {
  createdAt: string;
  title: string;
  updatedAt: string;
};

export type WorkspaceNote = NoteRecord & WorkspaceNoteHeader;

export type NoteTreeNode =
  | {
      folderId: FolderId;
      kind: "folder";
      title: string;
      children: NoteTreeNode[];
    }
  | {
      kind: "note";
      noteId: NoteId;
    };

export type WorkspaceData = {
  id: string;
  name: string;
  notes: NoteRecord[];
  tree: NoteTreeNode[];
};

export type WorkspaceNoteSourceReplacement = {
  noteId: NoteId;
  source: string;
};

export const defaultNoteTitle = "未命名笔记";

export class WorkspaceNoteHeaderError extends Error {
  constructor(noteId: NoteId, message: string) {
    super(`Invalid canonical title metadata for note ${noteId}: ${message}`);
    this.name = "WorkspaceNoteHeaderError";
  }
}

export function createCanonicalNoteSource({
  blockId,
  timestamp,
  title,
}: {
  blockId: string;
  timestamp: string;
  title: string;
}) {
  return `${formatCtnBlockMetadataLine({
    createdAt: timestamp,
    id: blockId,
    indentText: "",
    updatedAt: timestamp,
  })}\n${title}`;
}

export function readWorkspaceNoteHeader(note: NoteRecord): WorkspaceNoteHeader {
  let header;

  try {
    header = readCtnCanonicalTitleHeader(note.source);
  } catch (error) {
    throw new WorkspaceNoteHeaderError(
      note.id,
      error instanceof Error ? error.message : "metadata line is malformed",
    );
  }

  return {
    createdAt: header.metadata.createdAt,
    title: header.title,
    updatedAt: header.metadata.updatedAt,
  };
}

export function createNoteRecord(id: NoteId, source: string): NoteRecord {
  const note = { id, source };

  readWorkspaceNoteHeader(note);
  return note;
}

export function replaceWorkspaceNoteSources(
  workspace: WorkspaceData,
  replacements: readonly WorkspaceNoteSourceReplacement[],
): WorkspaceData {
  if (replacements.length === 0) {
    return workspace;
  }

  const sourceByNoteId = new Map<NoteId, string>();

  for (const replacement of replacements) {
    if (sourceByNoteId.has(replacement.noteId)) {
      throw new Error(`Duplicate workspace note source replacement: ${replacement.noteId}`);
    }
    createNoteRecord(replacement.noteId, replacement.source);
    sourceByNoteId.set(replacement.noteId, replacement.source);
  }

  const replacedNoteIds = new Set<NoteId>();
  let changed = false;
  const notes = workspace.notes.map((note) => {
    const source = sourceByNoteId.get(note.id);

    if (source === undefined) {
      return note;
    }
    replacedNoteIds.add(note.id);
    if (source === note.source) {
      return note;
    }
    changed = true;
    return { id: note.id, source };
  });

  for (const noteId of sourceByNoteId.keys()) {
    if (!replacedNoteIds.has(noteId)) {
      throw new Error(`Workspace note does not exist: ${noteId}`);
    }
  }

  return changed ? { ...workspace, notes } : workspace;
}

export function createInitialWorkspaceData(): WorkspaceData {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [],
  };
}
