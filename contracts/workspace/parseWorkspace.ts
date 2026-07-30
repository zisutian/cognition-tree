// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractArray,
  readContractObject,
  readContractString,
  readRequiredContractString,
} from "./contractValue.ts";
import type {
  RepositoryNoteDto,
  RepositoryTreeNodeDto,
  RepositoryWorkspaceDto,
} from "./types.ts";

const workspaceFields = ["id", "name", "notes", "tree"] as const;
const noteFields = ["id", "source"] as const;
const folderFields = ["children", "folderId", "kind", "title"] as const;
const noteNodeFields = ["kind", "noteId"] as const;

/**
 * A repository note id is also used as an adapter-owned metadata key. Keep
 * this rule in the wire contract so HTTP, Local, and WebDAV reject
 * the same content before any adapter-specific write begins.
 */
export function isRepositoryNoteId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function parseRepositoryNote(value: unknown, path: string): RepositoryNoteDto {
  const note = readContractObject(value, path);

  assertExactContractFields(note, noteFields, path);
  const id = readRequiredContractString(note, "id", path);

  if (!isRepositoryNoteId(id)) {
    failContract(`${path}.id`, "invalid repository note id");
  }

  return {
    id,
    source: readContractString(note, "source", path),
  };
}

type TreeParseState = {
  folderIds: Set<string>;
  noteIds: ReadonlySet<string>;
  placedNoteIds: Set<string>;
};

type PendingTreeNode = {
  destination: RepositoryTreeNodeDto[];
  path: string;
  value: unknown;
};

/** Iterative by design: repository data may contain very deep valid trees. */
export function parseRepositoryTree(
  value: unknown,
  path: string,
  noteIds: ReadonlySet<string>,
): RepositoryTreeNodeDto[] {
  if (!Array.isArray(value)) {
    failContract(path, "expected array");
  }

  const result: RepositoryTreeNodeDto[] = [];
  const state: TreeParseState = {
    folderIds: new Set(),
    noteIds,
    placedNoteIds: new Set(),
  };
  const pending: PendingTreeNode[] = [];

  for (let index = value.length - 1; index >= 0; index -= 1) {
    pending.push({ destination: result, path: `${path}[${index}]`, value: value[index] });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      break;
    }

    const node = readContractObject(current.value, current.path);
    const kind = readRequiredContractString(node, "kind", current.path);

    if (kind === "folder") {
      assertExactContractFields(node, folderFields, current.path);
      const folderId = readRequiredContractString(node, "folderId", current.path);

      if (state.folderIds.has(folderId)) {
        failContract(`${current.path}.folderId`, `duplicate folder id ${folderId}`);
      }
      state.folderIds.add(folderId);

      const childrenValue = readContractArray(node, "children", current.path);
      const children: RepositoryTreeNodeDto[] = [];
      current.destination.push({
        children,
        folderId,
        kind: "folder",
        title: readRequiredContractString(node, "title", current.path),
      });

      for (let index = childrenValue.length - 1; index >= 0; index -= 1) {
        pending.push({
          destination: children,
          path: `${current.path}.children[${index}]`,
          value: childrenValue[index],
        });
      }
      continue;
    }

    if (kind === "note") {
      assertExactContractFields(node, noteNodeFields, current.path);
      const noteId = readRequiredContractString(node, "noteId", current.path);

      if (!state.noteIds.has(noteId)) {
        failContract(`${current.path}.noteId`, `unknown note ${noteId}`);
      }
      if (state.placedNoteIds.has(noteId)) {
        failContract(`${current.path}.noteId`, `duplicate note placement ${noteId}`);
      }

      state.placedNoteIds.add(noteId);
      current.destination.push({ kind: "note", noteId });
      continue;
    }

    failContract(`${current.path}.kind`, `unsupported node kind ${kind}`);
  }

  for (const noteId of noteIds) {
    if (!state.placedNoteIds.has(noteId)) {
      failContract(path, `missing note placement ${noteId}`);
    }
  }

  return result;
}

export function parseRepositoryWorkspace(
  value: unknown,
  path = "$.workspace",
): RepositoryWorkspaceDto {
  const workspace = readContractObject(value, path);

  assertExactContractFields(workspace, workspaceFields, path);

  const noteValues = readContractArray(workspace, "notes", path);
  const noteIds = new Set<string>();
  const notes = noteValues.map((note, index) => {
    const parsedNote = parseRepositoryNote(note, `${path}.notes[${index}]`);

    if (noteIds.has(parsedNote.id)) {
      failContract(`${path}.notes[${index}].id`, `duplicate note id ${parsedNote.id}`);
    }

    noteIds.add(parsedNote.id);
    return parsedNote;
  });

  return {
    id: readRequiredContractString(workspace, "id", path),
    name: readRequiredContractString(workspace, "name", path),
    notes,
    tree: parseRepositoryTree(workspace.tree, `${path}.tree`, noteIds),
  };
}
