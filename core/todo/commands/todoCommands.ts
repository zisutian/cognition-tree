// SPDX-License-Identifier: GPL-3.0-or-later

import { reconcileCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
} from "../../ctn/metadata/sourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import {
  moveCtnBlockWithinText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../naming/portableName.ts";
import {
  collectTodoBlockIds,
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  parseTodoCollection,
  todoItemSemanticType,
  validateTodoContent,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";
import {
  requireTodoSyntaxProfile,
} from "../syntax/todoSyntax.ts";

export type CreateTodoCollectionInput = {
  collectionId: TodoCollectionId;
  createBlockId: () => string;
  createdAt: string;
  name: string;
};

export type RenameTodoCollectionInput = {
  collectionId: TodoCollectionId;
  name: string;
  updatedAt: string;
};

export type MoveTodoCollectionInput = {
  collectionId: TodoCollectionId;
  toIndex: number;
};

export type UpdateTodoCollectionBodyInput = {
  change: CtnEditableSourceChange;
  collectionId: TodoCollectionId;
  createBlockId: () => string;
  updatedAt: string;
};

export type ToggleTodoBlockInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  completedAt: string;
};

export type TodoBlockMoveTarget =
  | { kind: "end" }
  | {
      kind: "inside" | "above" | "below";
      targetBlockId: string;
    };

export type MoveTodoBlockInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  target: TodoBlockMoveTarget;
  updatedAt: string;
};

function canonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return milliseconds;
}

function findCollectionIndex(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const index = content.collections.findIndex(({ id }) => id === collectionId);

  if (index < 0) {
    throw new Error(`Todo collection does not exist: ${collectionId}`);
  }
  return index;
}

function replaceCollection(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
) {
  const collections = [...content.collections];

  collections[collectionIndex] = collection;
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

function assertTargetIndex(toIndex: number, length: number, label: string) {
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= length) {
    throw new Error(`${label} target index is out of bounds: ${toIndex}`);
  }
}

function moveAt<T>(values: readonly T[], fromIndex: number, toIndex: number) {
  const next = [...values];
  const [value] = next.splice(fromIndex, 1);

  next.splice(toIndex, 0, value as T);
  return next;
}

function cleanTodoCompletions(
  collection: TodoCollection,
  syntaxProfile: ReturnType<typeof requireTodoSyntaxProfile>,
) {
  const document = parseCtnCanonicalDocument(collection.source, syntaxProfile);
  const itemIds = new Set(document.blocks.map(({ id }) => id));

  return {
    ...collection,
    completions: collection.completions.filter(({ blockId }) =>
      itemIds.has(blockId)
    ),
  };
}

function assertCollectionNameAvailable(
  content: TodoContent,
  name: string,
  exceptCollectionId?: TodoCollectionId,
) {
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const key = createPortableNameKey(name);
  const conflict = content.collections.find((collection) =>
    collection.id !== exceptCollectionId &&
    createPortableNameKey(parseTodoCollection(collection, syntaxProfile).name) ===
      key
  );

  if (conflict) {
    throw new Error(`Todo collection name already exists: ${name}`);
  }
}

export function createTodoCollection(
  content: TodoContent,
  input: CreateTodoCollectionInput,
) {
  validateTodoContent(content);
  if (!isTodoCollectionId(input.collectionId)) {
    throw new Error(`Invalid todo collection id: ${input.collectionId}`);
  }
  if (content.collections.some(({ id }) => id === input.collectionId)) {
    throw new Error(`Todo collection already exists: ${input.collectionId}`);
  }
  canonicalTimestamp(input.createdAt, "Todo collection createdAt");
  const name = parsePortableName(input.name, "Todo collection name");
  assertCollectionNameAvailable(content, name);
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const source = initializeCtnSourceBlockMetadata(name, syntaxProfile, {
    createId: input.createBlockId,
    createdAt: input.createdAt,
    reservedIds: collectTodoBlockIds(content, syntaxProfile),
    updatedAt: input.createdAt,
  });
  const next: TodoContent = {
    ...content,
    collections: [
      ...content.collections,
      { completions: [], id: input.collectionId, source },
    ],
  };

  validateTodoContent(next);
  return { collectionId: input.collectionId, content: next };
}

export function renameTodoCollection(
  content: TodoContent,
  input: RenameTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const name = parsePortableName(input.name, "Todo collection name");
  const current = readCtnCanonicalTitleHeader(collection.source);

  if (current.title === name) return content;
  assertCollectionNameAvailable(content, name, input.collectionId);
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  if (Date.parse(input.updatedAt) < Date.parse(current.metadata.updatedAt)) {
    throw new Error("Todo collection updatedAt cannot move backwards.");
  }

  return replaceCollection(content, collectionIndex, {
    ...collection,
    source: replaceCtnSourceTitle(collection.source, name, input.updatedAt),
  });
}

export function deleteTodoCollection(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, collectionId);
  const collections = [...content.collections];

  collections.splice(collectionIndex, 1);
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

export function moveTodoCollection(
  content: TodoContent,
  input: MoveTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);

  assertTargetIndex(input.toIndex, content.collections.length, "Todo collection");
  if (collectionIndex === input.toIndex) return content;
  const next = {
    ...content,
    collections: moveAt(content.collections, collectionIndex, input.toIndex),
  };

  validateTodoContent(next);
  return next;
}

export function updateTodoCollectionBody(
  content: TodoContent,
  input: UpdateTodoCollectionBodyInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const current = createTodoCollectionBodyProjection(collection, syntaxProfile);

  assertCtnEditableSourceChange(current.source, input.change);
  if (current.source === input.change.source) return content;
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  const titleMetadata = readCtnCanonicalTitleHeader(collection.source).metadata;

  if (Date.parse(input.updatedAt) < Date.parse(titleMetadata.updatedAt)) {
    throw new Error("Todo collection updatedAt cannot move backwards.");
  }

  const nextEditableSource = `${current.name}\n${input.change.source}`;
  const titleSeparatorOffset = current.name.length + 1;
  const edits = current.editableSource === current.name
    ? [{
        from: current.name.length,
        insertedText: `\n${input.change.source}`,
        to: current.name.length,
      }]
    : input.change.edits.map((edit) => ({
        ...edit,
        from: edit.from + titleSeparatorOffset,
        to: edit.to + titleSeparatorOffset,
      }));
  const source = reconcileCtnSourceBlockMetadata(
    collection.source,
    { edits, source: nextEditableSource },
    syntaxProfile,
    {
      createId: input.createBlockId,
      reservedIds: collectTodoBlockIds(content, syntaxProfile),
      timestamp: input.updatedAt,
    },
  );
  const withSource = cleanTodoCompletions(
    { ...collection, source },
    syntaxProfile,
  );

  return replaceCollection(content, collectionIndex, withSource);
}

function requireTodoItemBlock(
  collection: TodoCollection,
  syntaxProfile: ReturnType<typeof requireTodoSyntaxProfile>,
  blockId: string,
) {
  const parsed = parseTodoCollection(collection, syntaxProfile);
  const block = parsed.document.blocks.find(({ id }) => id === blockId);

  if (!block || block.type !== todoItemSemanticType) {
    throw new Error(`Todo item block does not exist: ${blockId}`);
  }
  return block;
}

export function toggleTodoBlock(
  content: TodoContent,
  input: ToggleTodoBlockInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const block = requireTodoItemBlock(collection, syntaxProfile, input.blockId);
  const existingIndex = collection.completions.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );
  const completions = [...collection.completions];

  if (existingIndex >= 0) {
    completions.splice(existingIndex, 1);
  } else {
    const completedAt = canonicalTimestamp(
      input.completedAt,
      "Todo completion completedAt",
    );

    if (completedAt < Date.parse(block.metadata.createdAt)) {
      throw new Error("Todo completion cannot predate its block.");
    }
    completions.push({ blockId: input.blockId, completedAt: input.completedAt });
  }

  return replaceCollection(content, collectionIndex, {
    ...collection,
    completions,
  });
}

function blockRange(block: CtnCanonicalBlock) {
  return {
    indentText: block.indentText,
    level: block.level,
    lineNumber: block.lineNumber,
    metadataLineNumber: block.metadataLineNumber,
    subtreeEndLineNumber: block.subtreeEndLineNumber,
  };
}

function resolveMoveTarget(
  input: MoveTodoBlockInput,
  blocks: ReadonlyMap<string, CtnCanonicalBlock>,
): CtnBlockTextTargetPosition {
  if (input.target.kind === "end") return input.target;
  const target = blocks.get(input.target.targetBlockId);

  if (!target || target.type === "title") {
    throw new Error(`Todo target block does not exist: ${input.target.targetBlockId}`);
  }
  return {
    block: blockRange(target),
    kind: input.target.kind === "inside"
      ? "inside-block"
      : input.target.kind === "above"
        ? "sibling-above"
        : "sibling-below",
  };
}

export function moveTodoBlock(
  content: TodoContent,
  input: MoveTodoBlockInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const parsed = parseTodoCollection(collection, syntaxProfile);
  const blocks = new Map(parsed.document.blocks.map((block) => [block.id, block]));
  const sourceBlock = blocks.get(input.blockId);

  if (!sourceBlock || sourceBlock.type === syntaxProfile.titleRule.type) {
    throw new Error(`Todo source block does not exist: ${input.blockId}`);
  }
  canonicalTimestamp(input.updatedAt, "Todo block updatedAt");
  const result = moveCtnBlockWithinText({
    sourceBlock: blockRange(sourceBlock),
    sourceText: collection.source,
    syntaxProfile,
    targetPosition: resolveMoveTarget(input, blocks),
    updatedAt: input.updatedAt,
  });

  return replaceCollection(content, collectionIndex, {
    ...collection,
    source: result.nextText,
  });
}

export function updateTodoSyntaxSource(
  content: TodoContent,
  syntaxSource: string,
) {
  validateTodoContent(content);
  if (content.syntaxSource === syntaxSource) return content;
  const syntaxProfile = requireTodoSyntaxProfile(syntaxSource);
  const next = {
    ...content,
    syntaxSource,
    collections: content.collections.map((collection) =>
      cleanTodoCompletions(collection, syntaxProfile)
    ),
  };

  validateTodoContent(next);
  return next;
}
