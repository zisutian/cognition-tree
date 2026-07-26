// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactWireFields,
  failWireContract,
  readCanonicalTimestamp,
  readRequiredWireString,
  readWireArray,
  readWireObject,
  readWireString,
  UnsupportedWireVersionError,
} from "../../common/contractValue.ts";
import { serializeJsonIteratively } from "../../common/json.ts";
import { parseTodoContent } from "../parseTodo.ts";
import { serializeTodoRevisionContent } from "../revision.ts";
import type {
  TodoCompletionDto,
  TodoContentDto,
} from "../types.ts";

const contract = "Todo v3 migration";
const contentFields = ["collections", "schemaVersion", "syntaxSource"] as const;
const collectionFields = ["completions", "id", "source"] as const;
const completionFields = ["blockId", "completedAt"] as const;
const uuidSuffix =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const collectionIdPattern = new RegExp(`^todo-collection-${uuidSuffix}$`);
const blockIdPattern = new RegExp(`^${uuidSuffix}$`);

export type TodoCollectionV3Dto = {
  completions: TodoCompletionDto[];
  id: `todo-collection-${string}`;
  source: string;
};

export type TodoContentV3Dto = {
  collections: TodoCollectionV3Dto[];
  schemaVersion: 3;
  syntaxSource: string;
};

function parseCompletion(value: unknown, path: string): TodoCompletionDto {
  const completion = readWireObject(contract, value, path);

  assertExactWireFields(contract, completion, completionFields, path);
  const blockId = readRequiredWireString(
    contract,
    completion,
    "blockId",
    path,
  );

  if (!blockIdPattern.test(blockId)) {
    failWireContract(contract, `${path}.blockId`, "invalid Todo block id");
  }
  return {
    blockId,
    completedAt: readCanonicalTimestamp(
      contract,
      completion,
      "completedAt",
      path,
    ),
  };
}

function parseCollection(
  value: unknown,
  path: string,
): TodoCollectionV3Dto {
  const collection = readWireObject(contract, value, path);

  assertExactWireFields(contract, collection, collectionFields, path);
  const id = readRequiredWireString(contract, collection, "id", path);

  if (!collectionIdPattern.test(id)) {
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
    completions,
    id: id as TodoCollectionV3Dto["id"],
    source: readWireString(contract, collection, "source", path),
  };
}

export function parseTodoV3MigrationContent(
  value: unknown,
): TodoContentV3Dto {
  const content = readWireObject(contract, value, "$");

  if (content.schemaVersion !== 3) {
    throw new UnsupportedWireVersionError(
      contract,
      "$.schemaVersion",
      content.schemaVersion,
    );
  }
  assertExactWireFields(contract, content, contentFields, "$");
  const ids = new Set<string>();
  const collections = readWireArray(contract, content, "collections", "$")
    .map((collection, index) => {
      const parsed = parseCollection(
        collection,
        `$.collections[${index}]`,
      );

      if (ids.has(parsed.id)) {
        failWireContract(
          contract,
          `$.collections[${index}].id`,
          "duplicate collection id",
        );
      }
      ids.add(parsed.id);
      return parsed;
    });

  return {
    collections,
    schemaVersion: 3,
    syntaxSource: readWireString(contract, content, "syntaxSource", "$"),
  };
}

export function serializeTodoV3RevisionContent(
  content: TodoContentV3Dto,
) {
  return serializeJsonIteratively(content, { sortObjectKeys: true });
}

export function migrateTodoV3Content(value: unknown): TodoContentDto {
  const content = parseTodoV3MigrationContent(value);

  return {
    collections: content.collections.map((collection) => ({
      ...collection,
      recurrences: [],
    })),
    schemaVersion: 4,
    syntaxSource: content.syntaxSource,
  };
}

export function prepareTodoV4EpochMigration(value: unknown): {
  content: TodoContentDto;
  migrated: boolean;
  sourceRevisionContent: string;
} {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion === 4
  ) {
    const content = parseTodoContent(value);

    return {
      content,
      migrated: false,
      sourceRevisionContent: serializeTodoRevisionContent(content),
    };
  }
  const source = parseTodoV3MigrationContent(value);

  return {
    content: migrateTodoV3Content(source),
    migrated: true,
    sourceRevisionContent: serializeTodoV3RevisionContent(source),
  };
}
