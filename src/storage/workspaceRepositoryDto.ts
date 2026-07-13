import type {
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
} from "../workspace/model/workspaceData";
import { validateWorkspaceData } from "../workspace/model/workspaceValidation";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryCommitResult,
  WorkspaceRepositorySnapshot,
} from "./workspaceRepository";
import {
  workspaceSyntaxFileName,
  type WorkspaceSyntaxSourceFile,
} from "../workspace/context/workspaceSyntaxFile";

const workspaceFields = new Set([
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
const repositorySnapshotFields = new Set([
  "repositoryPath",
  "revision",
  "syntaxSourceFile",
  "workspace",
]);
const repositoryContentFields = new Set([
  "syntaxSourceFile",
  "workspace",
]);
const repositoryCommitResultFields = new Set(["revision"]);
const workspaceSyntaxSourceFileFields = new Set(["fileName", "source"]);

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

function readString(value: Record<string, unknown>, key: string, path: string) {
  const field = value[key];

  if (typeof field !== "string") {
    throw new Error(`Invalid response at ${path}.${key}: expected string`);
  }

  return field;
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const field = readString(value, key, path);

  if (field.length === 0) {
    throw new Error(`Invalid response at ${path}.${key}: expected non-empty string`);
  }

  return field;
}

function inferSourceTitle(source: string) {
  return source.split("\n")[0]?.trim() ?? "";
}

function parseNote(value: unknown, path: string): NoteRecord {
  assertRecord(value, path);
  assertExactFields(value, noteFields, path);

  const note = {
    createdAt: readRequiredString(value, "createdAt", path),
    id: readRequiredString(value, "id", path),
    source: readString(value, "source", path),
    title: readRequiredString(value, "title", path),
    updatedAt: readRequiredString(value, "updatedAt", path),
  };

  if (note.title !== inferSourceTitle(note.source)) {
    throw new Error(
      `Invalid response at ${path}.title: title does not match first line`,
    );
  }

  return note;
}

function parseTreeNode(value: unknown, path: string): NoteTreeNode {
  assertRecord(value, path);
  const kind = readRequiredString(value, "kind", path);

  if (kind === "folder") {
    assertExactFields(value, folderFields, path);

    if (!Array.isArray(value.children)) {
      throw new Error(`Invalid response at ${path}.children: expected array`);
    }

    return {
      children: value.children.map((child, index) =>
        parseTreeNode(child, `${path}.children[${index}]`),
      ),
      id: readRequiredString(value, "id", path),
      kind,
      title: readRequiredString(value, "title", path),
    };
  }

  if (kind === "note") {
    assertExactFields(value, noteNodeFields, path);

    return {
      id: readRequiredString(value, "id", path),
      kind,
      noteId: readRequiredString(value, "noteId", path),
    };
  }

  throw new Error(`Invalid response at ${path}.kind: unsupported node kind`);
}

function parseWorkspaceDataDto(value: unknown): WorkspaceData {
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
  const tree = value.tree.map((node, index) =>
    parseTreeNode(node, `$.tree[${index}]`),
  );

  const workspace: WorkspaceData = {
    id: readRequiredString(value, "id", "$"),
    name: readRequiredString(value, "name", "$"),
    notes,
    tree,
  };

  validateWorkspaceData(workspace);
  return workspace;
}

function parseWorkspaceSyntaxSourceFileDto(
  value: unknown,
): WorkspaceSyntaxSourceFile | null {
  if (value === null) {
    return null;
  }

  assertRecord(value, "$");
  assertExactFields(value, workspaceSyntaxSourceFileFields, "$");

  const fileName = readRequiredString(value, "fileName", "$");
  const source = readString(value, "source", "$");

  if (fileName !== workspaceSyntaxFileName) {
    throw new Error(
      `Invalid response at $.fileName: expected ${workspaceSyntaxFileName}`,
    );
  }

  return {
    fileName,
    source,
  };
}

export function parseWorkspaceRepositorySnapshotDto(
  value: unknown,
): WorkspaceRepositorySnapshot {
  assertRecord(value, "$");
  assertExactFields(value, repositorySnapshotFields, "$");

  return {
    repositoryPath: readRequiredString(value, "repositoryPath", "$"),
    revision: readRequiredString(value, "revision", "$"),
    syntaxSourceFile: parseWorkspaceSyntaxSourceFileDto(
      value.syntaxSourceFile,
    ),
    workspace: parseWorkspaceDataDto(value.workspace),
  };
}

export function parseWorkspaceRepositoryContentDto(
  value: unknown,
): WorkspaceRepositoryContent {
  assertRecord(value, "$");
  assertExactFields(value, repositoryContentFields, "$");

  return {
    syntaxSourceFile: parseWorkspaceSyntaxSourceFileDto(
      value.syntaxSourceFile,
    ),
    workspace: parseWorkspaceDataDto(value.workspace),
  };
}

export function parseWorkspaceRepositoryCommitResultDto(
  value: unknown,
): WorkspaceRepositoryCommitResult {
  assertRecord(value, "$");
  assertExactFields(value, repositoryCommitResultFields, "$");

  return {
    revision: readRequiredString(value, "revision", "$"),
  };
}
