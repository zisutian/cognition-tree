// SPDX-License-Identifier: GPL-3.0-or-later

const rootManifestFields = new Set([
  "activeNoteId",
  "defaultSyntaxProfileId",
  "id",
  "name",
  "notes",
  "tree",
]);
const rootWorkspaceFields = new Set([...rootManifestFields, "syntaxProfiles"]);
const manifestNoteFields = new Set([
  "createdAt",
  "fileName",
  "id",
  "syntaxProfileId",
  "syntaxVersion",
  "title",
  "updatedAt",
]);
const workspaceNoteFields = new Set([
  "createdAt",
  "id",
  "source",
  "syntaxProfileId",
  "syntaxVersion",
  "title",
  "updatedAt",
]);
const folderNodeFields = new Set(["children", "id", "kind", "title"]);
const noteNodeFields = new Set(["id", "kind", "noteId"]);

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
    throw new Error(`Invalid workspace DTO at ${path}: expected object`);
  }
}

function assertSupportedFields(value, supportedFields, path) {
  for (const key of Object.keys(value)) {
    if (!supportedFields.has(key)) {
      throw new Error(`Invalid workspace DTO at ${formatPath(path, key)}: unsupported field`);
    }
  }
}

function readRequiredString(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (typeof value[key] !== "string" || value[key].length === 0) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: expected non-empty string`);
  }

  return value[key];
}

function readRequiredStringValue(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (typeof value[key] !== "string") {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: expected string`);
  }

  return value[key];
}

function readRequiredStringOrNull(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (value[key] === null) {
    return null;
  }

  if (typeof value[key] !== "string" || value[key].length === 0) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: expected non-empty string or null`);
  }

  return value[key];
}

function readRequiredPositiveInteger(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (!Number.isInteger(value[key]) || value[key] < 1) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: expected positive integer`);
  }

  return value[key];
}

function readRequiredArray(value, key, path) {
  const fieldPath = formatPath(path, key);

  if (!(key in value)) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: missing field`);
  }

  if (!Array.isArray(value[key])) {
    throw new Error(`Invalid workspace DTO at ${fieldPath}: expected array`);
  }

  return value[key];
}

function assertSafeFileName(fileName, path) {
  if (
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error(`Invalid workspace DTO at ${path}: unsafe file name`);
  }
}

function assertNoteFileName(fileName, path) {
  assertSafeFileName(fileName, path);

  if (!fileName.endsWith(".ctn")) {
    throw new Error(`Invalid workspace DTO at ${path}: note file must use .ctn`);
  }
}

function assertUnique(value, values, path, label) {
  if (values.has(value)) {
    throw new Error(`Invalid workspace DTO at ${path}: duplicate ${label} ${value}`);
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
  assertNoteFileName(fileName, `${path}.fileName`);
  readRequiredString(note, "title", path);
  readRequiredString(note, "syntaxProfileId", path);
  readRequiredPositiveInteger(note, "syntaxVersion", path);
  readRequiredString(note, "createdAt", path);
  readRequiredString(note, "updatedAt", path);
}

function validateWorkspaceNote(note, index, noteIds) {
  const path = `$.notes[${index}]`;

  assertRecord(note, path);
  assertSupportedFields(note, workspaceNoteFields, path);

  const id = readRequiredString(note, "id", path);

  assertUnique(id, noteIds, `${path}.id`, "note id");
  assertSafeFileName(id, `${path}.id`);
  readRequiredString(note, "title", path);
  readRequiredStringValue(note, "source", path);
  readRequiredString(note, "syntaxProfileId", path);
  readRequiredPositiveInteger(note, "syntaxVersion", path);
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
      throw new Error(`Invalid workspace DTO at ${path}.noteId: unknown note ${noteId}`);
    }
    return;
  }

  throw new Error(`Invalid workspace DTO at ${path}.kind: unsupported node kind ${kind}`);
}

function validateWorkspaceRoot(value, supportedFields) {
  assertRecord(value, "$");
  assertSupportedFields(value, supportedFields, "$");

  const activeNoteId = readRequiredStringOrNull(value, "activeNoteId", "$");
  readRequiredString(value, "defaultSyntaxProfileId", "$");
  readRequiredString(value, "id", "$");
  readRequiredString(value, "name", "$");

  return {
    activeNoteId,
    notes: readRequiredArray(value, "notes", "$"),
    tree: readRequiredArray(value, "tree", "$"),
  };
}

function validateWorkspaceReferences({ activeNoteId, noteIds, tree }) {
  if (activeNoteId !== null && !noteIds.has(activeNoteId)) {
    throw new Error(`Invalid workspace DTO at $.activeNoteId: unknown note ${activeNoteId}`);
  }

  const treeNodeIds = new Set();

  tree.forEach((node, index) => {
    validateTreeNode(node, `$.tree[${index}]`, noteIds, treeNodeIds);
  });
}

export function assertWorkspaceManifestDto(manifest) {
  const { activeNoteId, notes, tree } = validateWorkspaceRoot(
    manifest,
    rootManifestFields,
  );
  const noteIds = new Set();

  notes.forEach((note, index) => {
    validateManifestNote(note, index, noteIds);
  });
  validateWorkspaceReferences({ activeNoteId, noteIds, tree });
}

export function assertWorkspacePayloadDto(workspace) {
  const { activeNoteId, notes, tree } = validateWorkspaceRoot(
    workspace,
    rootWorkspaceFields,
  );
  const noteIds = new Set();

  if (!("syntaxProfiles" in workspace)) {
    throw new Error("Invalid workspace DTO at $.syntaxProfiles: missing field");
  }

  if (!Array.isArray(workspace.syntaxProfiles)) {
    throw new Error("Invalid workspace DTO at $.syntaxProfiles: expected array");
  }

  notes.forEach((note, index) => {
    validateWorkspaceNote(note, index, noteIds);
  });
  validateWorkspaceReferences({ activeNoteId, noteIds, tree });
}
