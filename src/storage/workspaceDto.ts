import type {
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
} from "../domain/notes";
import { parseSyntaxProfileToml } from "../ctn-syntax/profileToml";
import type {
  RepositoryInfo,
  WorkspaceSyntaxFile,
} from "./workspaceRepository";

const workspaceFields = new Set([
  "activeNoteId",
  "id",
  "name",
  "notes",
  "tree",
]);
const noteFields = new Set([
  "createdAt",
  "id",
  "source",
  "title",
  "updatedAt",
]);
const folderFields = new Set(["children", "id", "kind", "title"]);
const noteNodeFields = new Set(["id", "kind", "noteId"]);
const repositoryInfoFields = new Set(["path"]);
const syntaxFileFields = new Set(["fileName", "source"]);

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid response at ${path}: expected object`);
  }
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: Set<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      throw new Error(`Invalid response at ${path}.${key}: unsupported field`);
    }
  }

  for (const field of fields) {
    if (!(field in value)) {
      throw new Error(`Invalid response at ${path}.${field}: missing field`);
    }
  }
}

function readString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  allowEmpty = false,
) {
  const field = value[key];

  if (typeof field !== "string" || (!allowEmpty && field.length === 0)) {
    throw new Error(`Invalid response at ${path}.${key}: expected string`);
  }

  return field;
}

function parseNote(value: unknown, path: string): NoteRecord {
  assertRecord(value, path);
  assertExactFields(value, noteFields, path);

  return {
    createdAt: readString(value, "createdAt", path),
    id: readString(value, "id", path),
    source: readString(value, "source", path, true),
    title: readString(value, "title", path),
    updatedAt: readString(value, "updatedAt", path),
  };
}

function parseTreeNode(value: unknown, path: string): NoteTreeNode {
  assertRecord(value, path);
  const kind = readString(value, "kind", path);

  if (kind === "folder") {
    assertExactFields(value, folderFields, path);

    if (!Array.isArray(value.children)) {
      throw new Error(`Invalid response at ${path}.children: expected array`);
    }

    return {
      children: value.children.map((child, index) =>
        parseTreeNode(child, `${path}.children[${index}]`),
      ),
      id: readString(value, "id", path),
      kind,
      title: readString(value, "title", path),
    };
  }

  if (kind === "note") {
    assertExactFields(value, noteNodeFields, path);

    return {
      id: readString(value, "id", path),
      kind,
      noteId: readString(value, "noteId", path),
    };
  }

  throw new Error(`Invalid response at ${path}.kind: unsupported node kind`);
}

function assertWorkspaceReferences(workspace: WorkspaceData) {
  const noteIds = new Set(workspace.notes.map((note) => note.id));
  const treeNodeIds = new Set<string>();

  if (
    workspace.activeNoteId !== null &&
    !noteIds.has(workspace.activeNoteId)
  ) {
    throw new Error("Invalid response at $.activeNoteId: unknown note");
  }

  const visit = (node: NoteTreeNode) => {
    if (treeNodeIds.has(node.id)) {
      throw new Error(`Invalid response at $.tree: duplicate node ${node.id}`);
    }

    treeNodeIds.add(node.id);

    if (node.kind === "note" && !noteIds.has(node.noteId)) {
      throw new Error(`Invalid response at $.tree: unknown note ${node.noteId}`);
    }

    if (node.kind === "folder") {
      node.children.forEach(visit);
    }
  };

  workspace.tree.forEach(visit);
}

export function parseWorkspaceDataDto(value: unknown): WorkspaceData | null {
  if (value === null) {
    return null;
  }

  assertRecord(value, "$");
  assertExactFields(value, workspaceFields, "$");

  if (!Array.isArray(value.notes)) {
    throw new Error("Invalid response at $.notes: expected array");
  }

  if (!Array.isArray(value.tree)) {
    throw new Error("Invalid response at $.tree: expected array");
  }

  const noteIds = new Set<string>();
  const notes = value.notes.map((note, index) => {
    const parsedNote = parseNote(note, `$.notes[${index}]`);

    if (noteIds.has(parsedNote.id)) {
      throw new Error(`Invalid response at $.notes: duplicate note ${parsedNote.id}`);
    }

    noteIds.add(parsedNote.id);
    return parsedNote;
  });
  const activeNoteId = value.activeNoteId;

  if (
    activeNoteId !== null &&
    (typeof activeNoteId !== "string" || activeNoteId.length === 0)
  ) {
    throw new Error("Invalid response at $.activeNoteId: expected string or null");
  }

  const workspace: WorkspaceData = {
    activeNoteId,
    id: readString(value, "id", "$"),
    name: readString(value, "name", "$"),
    notes,
    tree: value.tree.map((node, index) =>
      parseTreeNode(node, `$.tree[${index}]`),
    ),
  };

  assertWorkspaceReferences(workspace);
  return workspace;
}

export function parseRepositoryInfoDto(value: unknown): RepositoryInfo {
  assertRecord(value, "$");
  assertExactFields(value, repositoryInfoFields, "$");

  return {
    path: readString(value, "path", "$", true),
  };
}

export function parseWorkspaceSyntaxFileDto(
  value: unknown,
): WorkspaceSyntaxFile {
  assertRecord(value, "$");
  assertExactFields(value, syntaxFileFields, "$");

  const fileName = readString(value, "fileName", "$");
  const source = readString(value, "source", "$");
  const result = parseSyntaxProfileToml(source);

  if (!result.profile) {
    const message = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");

    throw new Error(`Invalid workspace syntax response: ${message}`);
  }

  return {
    fileName,
    profile: result.profile,
    source,
  };
}
