// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceRepositoryContractError } from "../../contracts/workspace-repository/contractValue.ts";
import { parseRepositoryTree } from "../../contracts/workspace-repository/parseWorkspace.ts";
import type { RepositoryTreeNodeDto } from "../../contracts/workspace-repository/types.ts";

export const workspaceManifestSchemaVersion = 2;

const manifestFields = new Set([
  "id",
  "name",
  "notes",
  "schemaVersion",
  "tree",
]);
const manifestNoteFields = new Set([
  "createdAt",
  "id",
  "title",
  "updatedAt",
]);

export type WorkspaceManifestNote = {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
};

export type WorkspaceManifest = {
  id: string;
  name: string;
  notes: WorkspaceManifestNote[];
  schemaVersion: typeof workspaceManifestSchemaVersion;
  tree: RepositoryTreeNodeDto[];
};

export class WorkspaceManifestValidationError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid workspace manifest at ${path}: ${message}`);
    this.name = "WorkspaceManifestValidationError";
  }
}

function failManifest(path: string, message: string): never {
  throw new WorkspaceManifestValidationError(path, message);
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failManifest(path, "expected object");
  }

  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      failManifest(`${path}.${key}`, "unsupported field");
    }
  }

  for (const field of fields) {
    if (!(field in value)) {
      failManifest(`${path}.${field}`, "missing field");
    }
  }
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const field = value[key];

  if (typeof field !== "string" || field.length === 0) {
    failManifest(`${path}.${key}`, "expected non-empty string");
  }

  return field;
}

export function isSafeWorkspaceNoteId(noteId: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(noteId);
}

function parseManifestNote(
  value: unknown,
  index: number,
): WorkspaceManifestNote {
  const path = `$.notes[${index}]`;
  const note = readObject(value, path);

  assertExactFields(note, manifestNoteFields, path);

  const parsedNote = {
    createdAt: readRequiredString(note, "createdAt", path),
    id: readRequiredString(note, "id", path),
    title: readRequiredString(note, "title", path),
    updatedAt: readRequiredString(note, "updatedAt", path),
  };

  if (!isSafeWorkspaceNoteId(parsedNote.id)) {
    failManifest(`${path}.id`, "unsafe note id");
  }

  return parsedNote;
}

export function parseWorkspaceManifest(value: unknown): WorkspaceManifest {
  const manifest = readObject(value, "$");

  assertExactFields(manifest, manifestFields, "$");

  if (manifest.schemaVersion !== workspaceManifestSchemaVersion) {
    failManifest(
      "$.schemaVersion",
      `expected ${workspaceManifestSchemaVersion}`,
    );
  }

  if (!Array.isArray(manifest.notes)) {
    failManifest("$.notes", "expected array");
  }

  const noteIds = new Set<string>();
  const notes = manifest.notes.map((note, index) => {
    const parsedNote = parseManifestNote(note, index);

    if (noteIds.has(parsedNote.id)) {
      failManifest(
        `$.notes[${index}].id`,
        `duplicate note id ${parsedNote.id}`,
      );
    }

    noteIds.add(parsedNote.id);
    return parsedNote;
  });

  let tree: RepositoryTreeNodeDto[];

  try {
    tree = parseRepositoryTree(manifest.tree, "$.tree", noteIds);
  } catch (error) {
    if (error instanceof WorkspaceRepositoryContractError) {
      throw new WorkspaceManifestValidationError(error.path, error.detail);
    }

    throw error;
  }

  return {
    id: readRequiredString(manifest, "id", "$"),
    name: readRequiredString(manifest, "name", "$"),
    notes,
    schemaVersion: workspaceManifestSchemaVersion,
    tree,
  };
}
