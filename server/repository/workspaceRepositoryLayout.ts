// SPDX-License-Identifier: GPL-3.0-or-later

import {
  WorkspaceRepositoryContractError,
} from "../../contracts/workspace-repository/contractValue.ts";
import { serializeJsonIteratively } from "../../contracts/workspace-repository/json.ts";
import {
  isRepositoryNoteId,
  parseRepositoryTree,
} from "../../contracts/workspace-repository/parseWorkspace.ts";
import {
  repositorySyntaxFileName,
  workspaceRepositorySchemaVersion,
  type RepositoryTreeNodeDto,
  type RepositoryWorkspaceDto,
  type WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types.ts";

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

export function createEmptyRepositoryContent(
  workspaceId = "local-workspace",
  workspaceName = "本地笔记库",
): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntaxSource: null,
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
  if (content.syntaxSource !== null) {
    files.set(`${syntaxDirName}/${repositorySyntaxFileName}`, content.syntaxSource);
  }

  return files;
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
