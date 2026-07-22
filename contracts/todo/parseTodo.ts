// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactWireFields,
  failWireContract,
  parseContentRevision,
  readCanonicalTimestamp,
  readRequiredWireString,
  readWireArray,
  readWireObject,
  readWireString,
  UnsupportedWireVersionError,
} from "../common/contractValue.ts";
import { defaultTodoSyntaxSourceV3 } from "./defaultContent.ts";
import type {
  TodoCollectionDto,
  TodoCommitDto,
  TodoCommitResultDto,
  TodoCompletionDto,
  TodoContentDto,
  TodoSnapshotDto,
} from "./types.ts";

const contract = "Todo v3";
const contentFields = ["collections", "schemaVersion", "syntaxSource"] as const;
const collectionFields = ["completions", "id", "source"] as const;
const completionFields = ["blockId", "completedAt"] as const;
const snapshotFields = ["content", "revision"] as const;
const commitFields = ["baseRevision", "content"] as const;
const resultFields = ["revision"] as const;
const uuidSuffix =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const collectionIdPattern = new RegExp(`^todo-collection-${uuidSuffix}$`);
const blockIdPattern = new RegExp(`^${uuidSuffix}$`);

export function isTodoCollectionId(
  value: string,
): value is TodoCollectionDto["id"] {
  return collectionIdPattern.test(value);
}

export function isTodoBlockId(value: string) {
  return blockIdPattern.test(value);
}

function parseCompletion(value: unknown, path: string): TodoCompletionDto {
  const completion = readWireObject(contract, value, path);

  assertExactWireFields(contract, completion, completionFields, path);
  const blockId = readRequiredWireString(contract, completion, "blockId", path);
  if (!blockIdPattern.test(blockId)) {
    failWireContract(contract, `${path}.blockId`, "invalid Todo block id");
  }
  return {
    blockId,
    completedAt: readCanonicalTimestamp(contract, completion, "completedAt", path),
  };
}

function parseCollection(value: unknown, path: string): TodoCollectionDto {
  const collection = readWireObject(contract, value, path);

  assertExactWireFields(contract, collection, collectionFields, path);
  const id = readRequiredWireString(contract, collection, "id", path);
  if (!isTodoCollectionId(id)) {
    failWireContract(contract, `${path}.id`, "invalid Todo collection id");
  }
  const completionIds = new Set<string>();
  const completions = readWireArray(contract, collection, "completions", path)
    .map((completion, index) => {
      const parsed = parseCompletion(
        completion,
        `${path}.completions[${index}]`,
      );
      if (completionIds.has(parsed.blockId)) {
        failWireContract(
          contract,
          `${path}.completions[${index}].blockId`,
          "duplicate completion block id",
        );
      }
      completionIds.add(parsed.blockId);
      return parsed;
    });
  return {
    id,
    source: readWireString(contract, collection, "source", path),
    completions,
  };
}

export function parseTodoContent(value: unknown): TodoContentDto {
  const content = readWireObject(contract, value, "$");

  if (content.schemaVersion !== 3) {
    throw new UnsupportedWireVersionError(contract, "$.schemaVersion", content.schemaVersion);
  }
  assertExactWireFields(contract, content, contentFields, "$");
  const ids = new Set<string>();
  const collections = readWireArray(contract, content, "collections", "$" )
    .map((collection, index) => {
      const parsed = parseCollection(collection, `$.collections[${index}]`);
      if (ids.has(parsed.id)) {
        failWireContract(contract, `$.collections[${index}].id`, "duplicate collection id");
      }
      ids.add(parsed.id);
      return parsed;
    });
  return {
    schemaVersion: 3,
    syntaxSource: readWireString(contract, content, "syntaxSource", "$"),
    collections,
  };
}

export function parseTodoSnapshot(value: unknown): TodoSnapshotDto {
  const snapshot = readWireObject(contract, value, "$");

  assertExactWireFields(contract, snapshot, snapshotFields, "$");
  return {
    content: parseTodoContent(snapshot.content),
    revision: parseContentRevision(snapshot.revision, "$.revision"),
  };
}

export function parseTodoCommit(value: unknown): TodoCommitDto {
  const commit = readWireObject(contract, value, "$");

  assertExactWireFields(contract, commit, commitFields, "$");
  return {
    baseRevision: parseContentRevision(commit.baseRevision, "$.baseRevision"),
    content: parseTodoContent(commit.content),
  };
}

export function parseTodoCommitResult(value: unknown): TodoCommitResultDto {
  const result = readWireObject(contract, value, "$");

  assertExactWireFields(contract, result, resultFields, "$");
  return { revision: parseContentRevision(result.revision, "$.revision") };
}

export function createEmptyTodoContent(): TodoContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: defaultTodoSyntaxSourceV3,
    collections: [],
  };
}
