// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createCtnEditableSourceFromDocument,
  getCtnEditableLineNumber,
} from "../../ctn/metadata/editableSource.ts";
import { isCtnBlockId } from "../../ctn/metadata/blockMetadata.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
} from "../../ctn/parser/types.ts";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types.ts";
import { getPortableNameIssue } from "../../naming/portableName.ts";
import { requireTodoSyntaxProfile } from "../syntax/todoSyntax.ts";

export const todoRepositoryPurpose = "system-todo" as const;
export const todoRepositorySchemaVersion = 2 as const;
export const todoItemSemanticType = "todo-item";

export type TodoCollectionId = `todo-collection-${string}`;

export type TodoCompletion = {
  blockId: string;
  completedAt: string;
};

export type TodoCollection = {
  id: TodoCollectionId;
  source: string;
  completions: TodoCompletion[];
};

export type TodoContent = {
  purpose: typeof todoRepositoryPurpose;
  schemaVersion: typeof todoRepositorySchemaVersion;
  syntaxSource: string;
  collections: TodoCollection[];
};

export type TodoCollectionValue = Omit<TodoCollection, "id"> & { id: string };
export type TodoContentValue = Omit<TodoContent, "collections"> & {
  collections: TodoCollectionValue[];
};

export type ParsedTodoCollection = {
  collection: TodoCollection;
  document: CtnCanonicalDocument;
  name: string;
};

const collectionIdPattern =
  /^todo-collection-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TodoContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoContentValidationError";
  }
}

export function isTodoCollectionId(value: string): value is TodoCollectionId {
  return collectionIdPattern.test(value);
}

function readCanonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new TodoContentValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
  return milliseconds;
}

export function parseTodoCollection(
  value: TodoCollectionValue,
  syntaxProfile: CtnSyntaxProfile,
): ParsedTodoCollection {
  if (!isTodoCollectionId(value.id)) {
    throw new TodoContentValidationError(
      `Invalid todo collection id: ${value.id}`,
    );
  }

  let document: CtnCanonicalDocument;
  let name: string;

  try {
    const header = readCtnCanonicalTitleHeader(value.source);

    name = header.title;
    document = parseCtnCanonicalDocument(value.source, syntaxProfile);
  } catch (error) {
    throw new TodoContentValidationError(
      `Todo collection ${value.id} has invalid canonical CTN source: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }

  const blockById = new Map(document.blocks.map((block) => [block.id, block]));
  const completionIds = new Set<string>();

  for (const completion of value.completions) {
    if (!isCtnBlockId(completion.blockId)) {
      throw new TodoContentValidationError(
        `Invalid todo completion block id: ${completion.blockId}`,
      );
    }
    if (completionIds.has(completion.blockId)) {
      throw new TodoContentValidationError(
        `Duplicate todo completion block id: ${completion.blockId}`,
      );
    }
    completionIds.add(completion.blockId);
    const block = blockById.get(completion.blockId);

    if (!block) {
      throw new TodoContentValidationError(
        `Todo completion ${completion.blockId} does not identify a source block.`,
      );
    }
    const completedAt = readCanonicalTimestamp(
      completion.completedAt,
      `Todo completion ${completion.blockId} completedAt`,
    );

    if (completedAt < Date.parse(block.metadata.createdAt)) {
      throw new TodoContentValidationError(
        `Todo completion ${completion.blockId} predates its block.`,
      );
    }
  }

  return {
    collection: value as TodoCollection,
    document,
    name,
  };
}

export function validateTodoContent(content: TodoContentValue): TodoContent {
  if (content.purpose !== todoRepositoryPurpose) {
    throw new TodoContentValidationError(
      `Todo purpose must be ${todoRepositoryPurpose}.`,
    );
  }
  if (content.schemaVersion !== todoRepositorySchemaVersion) {
    throw new TodoContentValidationError(
      `Todo schema version must be ${todoRepositorySchemaVersion}.`,
    );
  }

  let syntaxProfile: CtnSyntaxProfile;

  try {
    syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  } catch (error) {
    throw new TodoContentValidationError(
      `Todo syntax is invalid: ${
        error instanceof Error ? error.message : "unknown syntax error"
      }`,
    );
  }

  const collectionIds = new Set<TodoCollectionId>();
  const blockOwners = new Map<string, TodoCollectionId>();

  for (const collection of content.collections) {
    const parsed = parseTodoCollection(collection, syntaxProfile);

    if (collectionIds.has(parsed.collection.id)) {
      throw new TodoContentValidationError(
        `Duplicate todo collection id: ${parsed.collection.id}`,
      );
    }
    collectionIds.add(parsed.collection.id);

    for (const block of parsed.document.blocks) {
      const owner = blockOwners.get(block.id);

      if (owner) {
        throw new TodoContentValidationError(
          `Todo block id ${block.id} is shared by ${owner} and ${collection.id}.`,
        );
      }
      blockOwners.set(block.id, parsed.collection.id);
    }
  }

  return content as TodoContent;
}

type LocatedBlock = {
  block: CtnCanonicalBlock;
  collectionId: TodoCollectionId;
};

function collectLocatedBlocks(content: TodoContent, profile: CtnSyntaxProfile) {
  const blocks = new Map<string, LocatedBlock>();

  for (const collection of content.collections) {
    const parsed = parseTodoCollection(collection, profile);

    for (const block of parsed.document.blocks) {
      blocks.set(block.id, { block, collectionId: collection.id });
    }
  }
  return blocks;
}

export function validateTodoContentTransition(
  previousValue: TodoContentValue,
  nextValue: TodoContentValue,
): TodoContent {
  const previous = validateTodoContent(previousValue);
  const next = validateTodoContent(nextValue);
  const previousProfile = requireTodoSyntaxProfile(previous.syntaxSource);
  const nextProfile = requireTodoSyntaxProfile(next.syntaxSource);
  const previousCollections = new Map(
    previous.collections.map((collection) => [collection.id, collection]),
  );
  const previousBlocks = collectLocatedBlocks(previous, previousProfile);
  const nextBlocks = collectLocatedBlocks(next, nextProfile);

  for (const nextCollection of next.collections) {
    const previousCollection = previousCollections.get(nextCollection.id);

    if (!previousCollection) continue;
    const previousTitle = readCtnCanonicalTitleHeader(previousCollection.source);
    const nextTitle = readCtnCanonicalTitleHeader(nextCollection.source);

    if (previousTitle.metadata.id !== nextTitle.metadata.id) {
      throw new TodoContentValidationError(
        `Todo collection ${nextCollection.id} title block id is immutable.`,
      );
    }
    if (previousTitle.metadata.createdAt !== nextTitle.metadata.createdAt) {
      throw new TodoContentValidationError(
        `Todo collection ${nextCollection.id} createdAt is immutable.`,
      );
    }
  }

  for (const [blockId, previousLocation] of previousBlocks) {
    const nextLocation = nextBlocks.get(blockId);

    if (!nextLocation) continue;
    if (previousLocation.collectionId !== nextLocation.collectionId) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} cannot move to another collection.`,
      );
    }
    if (
      previousLocation.block.metadata.createdAt !==
        nextLocation.block.metadata.createdAt
    ) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} createdAt is immutable.`,
      );
    }
    if (
      Date.parse(nextLocation.block.metadata.updatedAt) <
        Date.parse(previousLocation.block.metadata.updatedAt)
    ) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} updatedAt cannot move backwards.`,
      );
    }
  }

  return next;
}

export function createTodoCollectionBodyProjection(
  collection: TodoCollectionValue,
  syntaxProfile: CtnSyntaxProfile,
) {
  const parsed = parseTodoCollection(collection, syntaxProfile);
  const editable = createCtnEditableSourceFromDocument(
    parsed.collection.source,
    parsed.document,
  );
  const prefix = `${parsed.name}\n`;
  const source = editable.source === parsed.name
    ? ""
    : editable.source.startsWith(prefix)
      ? editable.source.slice(prefix.length)
      : (() => {
          throw new TodoContentValidationError(
            `Todo collection ${collection.id} has an invalid editable title.`,
          );
        })();

  return {
    document: parsed.document,
    editableSource: editable.source,
    name: parsed.name,
    source,
    projectCanonicalLineNumber(canonicalLineNumber: number) {
      return Math.max(
        1,
        getCtnEditableLineNumber(editable, canonicalLineNumber) - 1,
      );
    },
  };
}

export function collectTodoBlockIds(
  content: TodoContentValue,
  syntaxProfile: CtnSyntaxProfile,
) {
  const ids = new Set<string>();

  for (const collection of content.collections) {
    for (const block of parseTodoCollection(collection, syntaxProfile).document
      .blocks) {
      ids.add(block.id);
    }
  }
  return ids;
}

export function getTodoCollectionNameIssue(
  collection: TodoCollectionValue,
  syntaxProfile: CtnSyntaxProfile,
) {
  return getPortableNameIssue(parseTodoCollection(collection, syntaxProfile).name);
}
