// SPDX-License-Identifier: GPL-3.0-or-later

const rootManifestFields = new Set([
  "id",
  "name",
  "notes",
  "tree",
]);
const rootWorkspaceFields = rootManifestFields;
const manifestNoteFields = new Set([
  "createdAt",
  "fileName",
  "id",
  "title",
  "updatedAt",
]);
const workspaceNoteFields = new Set([
  "createdAt",
  "id",
  "source",
  "title",
  "updatedAt",
]);
const folderNodeFields = new Set(["children", "id", "kind", "title"]);
const noteNodeFields = new Set(["id", "kind", "noteId"]);

export class WorkspaceDataValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceDataValidationError";
  }
}

function failValidation(message) {
  throw new WorkspaceDataValidationError(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPath(path, key) {
  if (path === "$") {
    return `$.${key}`;
  }

  return `${path}.${key}`;
}

function assertRecord(value, path) {
  if (!isRecord(value)) {
    failValidation(`Invalid workspace DTO at ${path}: expected object`);
  }
}

function assertSupportedFields(value, supportedFields, path) {
  for (const key of Object.keys(value)) {
    if (!supportedFields.has(key)) {
      failValidation(`Invalid workspace DTO at ${formatPath(path, key)}: unsupported field`);
    }
  }
}

function readRequiredString(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    failValidation(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (typeof value[key] !== "string" || value[key].length === 0) {
    failValidation(`Invalid workspace DTO at ${fieldPath}: expected non-empty string`);
  }

  return value[key];
}

function readRequiredStringValue(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    failValidation(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (typeof value[key] !== "string") {
    failValidation(`Invalid workspace DTO at ${fieldPath}: expected string`);
  }

  return value[key];
}

function readRequiredArray(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    failValidation(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (!Array.isArray(value[key])) {
    failValidation(`Invalid workspace DTO at ${fieldPath}: expected array`);
  }

  return value[key];
}

function assertSafePathSegment(segment, path) {
  if (
    segment.length === 0 ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment === "." ||
    segment === ".."
  ) {
    failValidation(`Invalid workspace DTO at ${path}: unsafe path segment`);
  }
}

function assertSafeRelativePath(fileName, path) {
  if (
    fileName.length === 0 ||
    fileName.startsWith("/") ||
    fileName.includes("\\")
  ) {
    failValidation(`Invalid workspace DTO at ${path}: unsafe file path`);
  }

  fileName.split("/").forEach((segment) =>
    assertSafePathSegment(segment, path),
  );
}

function assertNoteFilePath(fileName, path) {
  assertSafeRelativePath(fileName, path);

  if (!fileName.endsWith(".ctn")) {
    failValidation(`Invalid workspace DTO at ${path}: note file must use .ctn`);
  }
}

function assertUnique(value, values, path, label) {
  if (values.has(value)) {
    failValidation(`Invalid workspace DTO at ${path}: duplicate ${label} ${value}`);
  }

  values.add(value);
}

function validateManifestNote(note, index, noteIds) {
  const path = `$.notes[${index}]`;

  assertRecord(note, path);
  assertSupportedFields(note, manifestNoteFields, path);

  const id = readRequiredString(note, "id", path);
  const fileName = readRequiredString(note, "fileName", path);

  assertUnique(id, noteIds, `${path}.id`, "note id");
  assertNoteFilePath(fileName, `${path}.fileName`);
  readRequiredString(note, "title", path);
  readRequiredString(note, "createdAt", path);
  readRequiredString(note, "updatedAt", path);
}

function validateWorkspaceNote(note, index, noteIds) {
  const path = `$.notes[${index}]`;

  assertRecord(note, path);
  assertSupportedFields(note, workspaceNoteFields, path);

  const id = readRequiredString(note, "id", path);

  assertUnique(id, noteIds, `${path}.id`, "note id");
  assertSafePathSegment(id, `${path}.id`);
  readRequiredString(note, "title", path);
  readRequiredStringValue(note, "source", path);
  readRequiredString(note, "createdAt", path);
  readRequiredString(note, "updatedAt", path);
}

function validateTreeNode(node, path, noteIds, treeNodeIds) {
  assertRecord(node, path);

  const kind = readRequiredString(node, "kind", path);
  const id = readRequiredString(node, "id", path);

  assertUnique(id, treeNodeIds, `${path}.id`, "tree node id");

  if (kind === "folder") {
    assertSupportedFields(node, folderNodeFields, path);
    readRequiredString(node, "title", path);

    const children = readRequiredArray(node, "children", path);

    children.forEach((child, index) => {
      validateTreeNode(child, `${path}.children[${index}]`, noteIds, treeNodeIds);
    });
    return;
  }

  if (kind === "note") {
    assertSupportedFields(node, noteNodeFields, path);
    const noteId = readRequiredString(node, "noteId", path);

    if (!noteIds.has(noteId)) {
      failValidation(`Invalid workspace DTO at ${path}.noteId: unknown note ${noteId}`);
    }
    return;
  }

  failValidation(`Invalid workspace DTO at ${path}.kind: unsupported node kind ${kind}`);
}

function validateWorkspaceRoot(value, supportedFields) {
  assertRecord(value, "$");
  assertSupportedFields(value, supportedFields, "$");

  readRequiredString(value, "id", "$");
  readRequiredString(value, "name", "$");

  return {
    notes: readRequiredArray(value, "notes", "$"),
    tree: readRequiredArray(value, "tree", "$"),
  };
}

function validateWorkspaceReferences({ noteIds, tree }) {
  const treeNodeIds = new Set();

  tree.forEach((node, index) => {
    validateTreeNode(node, `$.tree[${index}]`, noteIds, treeNodeIds);
  });
}

export function assertWorkspaceManifest(manifest) {
  const { notes, tree } = validateWorkspaceRoot(
    manifest,
    rootManifestFields,
  );
  const noteIds = new Set();

  notes.forEach((note, index) => {
    validateManifestNote(note, index, noteIds);
  });
  validateWorkspaceReferences({ noteIds, tree });
}

export function assertWorkspaceData(workspace) {
  const { notes, tree } = validateWorkspaceRoot(
    workspace,
    rootWorkspaceFields,
  );
  const noteIds = new Set();

  notes.forEach((note, index) => {
    validateWorkspaceNote(note, index, noteIds);
  });
  validateWorkspaceReferences({ noteIds, tree });
}
