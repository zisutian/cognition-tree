// SPDX-License-Identifier: GPL-3.0-or-later

import {
  WorkspaceRepositoryContractError,
  isRepositoryNoteId,
  parseRepositoryTree,
  isRepositorySyntaxFileId,
  parseRepositorySyntaxCatalog,
  repositorySyntaxIndexFileName,
  workspaceRepositorySchemaVersion,
  type RepositoryTreeNodeDto,
  type RepositorySyntaxCatalogDto,
  type RepositoryWorkspaceDto,
  type WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/index.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/index.ts";




export const workspaceFileName = "workspace.json";
export const notesDirName = "notes";
export const syntaxDirName = "syntax";

const workspaceFields = new Set(["id", "name", "tree"]);

export class WorkspacePayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePayloadValidationError";
  }
}

export function createRepositoryNoteFileName(noteId: string) {
  if (!isRepositoryNoteId(noteId)) {
    throw new WorkspacePayloadValidationError(`Unsafe note id: ${noteId}`);
  }

  return `${noteId}.ctn`;
}

export function createRepositorySyntaxFileName(syntaxFileId: string) {
  if (!isRepositorySyntaxFileId(syntaxFileId)) {
    throw new WorkspacePayloadValidationError(`Unsafe syntax file id: ${syntaxFileId}`);
  }

  return `${syntaxFileId}.toml`;
}

export function createEmptyRepositoryContent(
  workspaceId = "local-workspace",
  workspaceName = "本地笔记库",
): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntax: { activeFileId: null, files: [] },
    workspace: {
      id: workspaceId,
      name: workspaceName,
      notes: [],
      tree: [],
    },
  };
}

export function createWorkspaceSnapshotFileSet(
  content: WorkspaceRepositoryContentDto,
) {
  const files = new Map<string, string>();
  const workspaceFile = {
    id: content.workspace.id,
    name: content.workspace.name,
    tree: content.workspace.tree,
  };

  files.set(
    workspaceFileName,
    `${serializeJsonIteratively(workspaceFile)}\n`,
  );
  for (const note of [...content.workspace.notes].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    files.set(`${notesDirName}/${createRepositoryNoteFileName(note.id)}`, note.source);
  }
  files.set(
    `${syntaxDirName}/${repositorySyntaxIndexFileName}`,
    `${serializeJsonIteratively({
      activeFileId: content.syntax.activeFileId,
      files: content.syntax.files.map((file) => file.id),
    })}\n`,
  );
  for (const file of content.syntax.files) {
    files.set(`${syntaxDirName}/${createRepositorySyntaxFileName(file.id)}`, file.source);
  }

  return files;
}

export async function loadSyntaxFromSnapshot(
  value: unknown,
  readSyntaxSource: (syntaxFileId: string) => Promise<string>,
): Promise<RepositorySyntaxCatalogDto> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WorkspaceRepositoryContractError("$", "expected object");
  }
  const index = value as Record<string, unknown>;
  const fields = new Set(["activeFileId", "files"]);
  for (const key of Object.keys(index)) {
    if (!fields.has(key)) {
      throw new WorkspaceRepositoryContractError(`$.${key}`, "unsupported field");
    }
  }
  for (const field of fields) {
    if (!(field in index)) {
      throw new WorkspaceRepositoryContractError(`$.${field}`, "missing field");
    }
  }
  if (!Array.isArray(index.files)) {
    throw new WorkspaceRepositoryContractError("$.files", "expected array");
  }
  const files = await Promise.all(index.files.map(async (id, fileIndex) => {
    if (typeof id !== "string" || !isRepositorySyntaxFileId(id)) {
      throw new WorkspaceRepositoryContractError(
        `$.files[${fileIndex}]`,
        "invalid repository syntax file id",
      );
    }
    return { id, source: await readSyntaxSource(id) };
  }));

  return parseRepositorySyntaxCatalog({
    activeFileId: index.activeFileId,
    files,
  });
}

function parseWorkspaceFile(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WorkspaceRepositoryContractError("$", "expected object");
  }
  const workspace = value as Record<string, unknown>;

  for (const key of Object.keys(workspace)) {
    if (!workspaceFields.has(key)) {
      throw new WorkspaceRepositoryContractError(`$.${key}`, "unsupported field");
    }
  }
  for (const field of workspaceFields) {
    if (!(field in workspace)) {
      throw new WorkspaceRepositoryContractError(`$.${field}`, "missing field");
    }
  }
  if (typeof workspace.id !== "string" || workspace.id.length === 0) {
    throw new WorkspaceRepositoryContractError("$.id", "expected non-empty string");
  }
  if (typeof workspace.name !== "string" || workspace.name.length === 0) {
    throw new WorkspaceRepositoryContractError("$.name", "expected non-empty string");
  }
  if (!Array.isArray(workspace.tree)) {
    throw new WorkspaceRepositoryContractError("$.tree", "expected array");
  }

  return {
    id: workspace.id,
    name: workspace.name,
    tree: workspace.tree,
  };
}

function collectNoteIdsFromTree(value: unknown[]): Set<string> {
  const ids = new Set<string>();
  const pending: unknown[] = [...value];

  while (pending.length > 0) {
    const node = pending.pop();

    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      continue;
    }
    const record = node as Record<string, unknown>;

    if (record.kind === "note" && typeof record.noteId === "string") {
      ids.add(record.noteId);
    } else if (record.kind === "folder" && Array.isArray(record.children)) {
      pending.push(...record.children);
    }
  }

  return ids;
}

export async function loadWorkspaceFromSnapshot(
  value: unknown,
  readNoteSource: (noteId: string) => Promise<string>,
): Promise<RepositoryWorkspaceDto> {
  const workspaceFile = parseWorkspaceFile(value);
  const noteIds = collectNoteIdsFromTree(workspaceFile.tree);
  const tree = parseRepositoryTree(workspaceFile.tree, "$.tree", noteIds);
  const notes = await Promise.all(
    [...noteIds].sort((left, right) => left.localeCompare(right)).map(async (id) => ({
      id,
      source: await readNoteSource(id),
    })),
  );

  return {
    id: workspaceFile.id,
    name: workspaceFile.name,
    notes,
    tree: tree as RepositoryTreeNodeDto[],
  };
}
