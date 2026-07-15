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
import { inferRepositoryNoteTitle } from "./noteSource.ts";

const workspaceFields = ["id", "name", "notes", "tree"] as const;
const noteFields = [
  "createdAt",
  "id",
  "source",
  "title",
  "updatedAt",
] as const;
const folderFields = ["children", "id", "kind", "title"] as const;
const noteNodeFields = ["id", "kind", "noteId"] as const;

function parseRepositoryNote(value: unknown, path: string): RepositoryNoteDto {
  const note = readContractObject(value, path);

  assertExactContractFields(note, noteFields, path);

  const parsedNote = {
    createdAt: readRequiredContractString(note, "createdAt", path),
    id: readRequiredContractString(note, "id", path),
    source: readContractString(note, "source", path),
    title: readRequiredContractString(note, "title", path),
    updatedAt: readRequiredContractString(note, "updatedAt", path),
  };

  if (parsedNote.title !== inferRepositoryNoteTitle(parsedNote.source)) {
    failContract(`${path}.title`, "title does not match first line");
  }

  return parsedNote;
}

type TreeParseState = {
  noteIds: ReadonlySet<string>;
  placedNoteIds: Set<string>;
  treeNodeIds: Set<string>;
};

function parseTreeNode(
  value: unknown,
  path: string,
  state: TreeParseState,
): RepositoryTreeNodeDto {
  const node = readContractObject(value, path);
  const kind = readRequiredContractString(node, "kind", path);
  const id = readRequiredContractString(node, "id", path);

  if (state.treeNodeIds.has(id)) {
    failContract(`${path}.id`, `duplicate tree node id ${id}`);
  }

  state.treeNodeIds.add(id);

  if (kind === "folder") {
    assertExactContractFields(node, folderFields, path);
    const children = readContractArray(node, "children", path);

    return {
      children: children.map((child, index) =>
        parseTreeNode(child, `${path}.children[${index}]`, state),
      ),
      id,
      kind,
      title: readRequiredContractString(node, "title", path),
    };
  }

  if (kind === "note") {
    assertExactContractFields(node, noteNodeFields, path);
    const noteId = readRequiredContractString(node, "noteId", path);

    if (!state.noteIds.has(noteId)) {
      failContract(`${path}.noteId`, `unknown note ${noteId}`);
    }

    if (state.placedNoteIds.has(noteId)) {
      failContract(`${path}.noteId`, `duplicate note placement ${noteId}`);
    }

    state.placedNoteIds.add(noteId);
    return { id, kind, noteId };
  }

  failContract(`${path}.kind`, `unsupported node kind ${kind}`);
}

export function parseRepositoryTree(
  value: unknown,
  path: string,
  noteIds: ReadonlySet<string>,
) {
  if (!Array.isArray(value)) {
    failContract(path, "expected array");
  }

  const state: TreeParseState = {
    noteIds,
    placedNoteIds: new Set(),
    treeNodeIds: new Set(),
  };
  const tree = value.map((node, index) =>
    parseTreeNode(node, `${path}[${index}]`, state),
  );

  for (const noteId of noteIds) {
    if (!state.placedNoteIds.has(noteId)) {
      failContract(path, `missing note placement ${noteId}`);
    }
  }

  return tree;
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
      failContract(
        `${path}.notes[${index}].id`,
        `duplicate note id ${parsedNote.id}`,
      );
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
