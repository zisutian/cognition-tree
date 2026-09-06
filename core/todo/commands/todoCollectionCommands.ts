// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  reconcileCtnSourceBlockMetadata,
  initializeCtnSourceBlockMetadataAnalysis,
  replaceCtnSourceTitle,
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
  readCtnCanonicalTitleHeader,
} from "../../ctn/index.ts";




import {
  DomainValidationError,
} from "../../errors/index.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../naming/index.ts";
import type { TodoParseIndex } from "../indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../model/todoContent.ts";
import { isTodoCollectionId } from "../model/todoIdentity.ts";
import {
  cleanTodoCollectionSidecars,
  findTodoCollectionIndex,
  readTodoCommandTimestamp,
  replaceTodoCollection,
} from "./todoCommandSupport.ts";

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

function assertTargetIndex(toIndex: number, length: number, label: string) {
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= length) {
    throw new DomainValidationError(
      `${label} target index is out of bounds: ${toIndex}`,
    );
  }
}

function moveAt<T>(values: readonly T[], fromIndex: number, toIndex: number) {
  const next = [...values];
  const [value] = next.splice(fromIndex, 1);

  next.splice(toIndex, 0, value as T);
  return next;
}

function assertCollectionNameAvailable(
  index: TodoParseIndex,
  name: string,
  exceptCollectionId?: TodoCollectionId,
) {
  const key = createPortableNameKey(name);
  const conflict = index.collections.find(({ collection, name }) =>
    collection.id !== exceptCollectionId &&
    createPortableNameKey(name) === key
  );

  if (conflict) {
    throw new DomainValidationError(
      `Todo collection name already exists: ${name}`,
    );
  }
}

export function createTodoCollection(
  content: TodoContent,
  index: TodoParseIndex,
  input: CreateTodoCollectionInput,
) {
  if (!isTodoCollectionId(input.collectionId)) {
    throw new DomainValidationError(
      `Invalid todo collection id: ${input.collectionId}`,
    );
  }
  if (content.collections.some(({ id }) => id === input.collectionId)) {
    throw new DomainValidationError(
      `Todo collection already exists: ${input.collectionId}`,
    );
  }
  readTodoCommandTimestamp(input.createdAt, "Todo collection createdAt");
  const name = parsePortableName(input.name, "Todo collection name");
  assertCollectionNameAvailable(index, name);
  const initialized = initializeCtnSourceBlockMetadataAnalysis(
    name,
    index.syntax,
    {
      createId: input.createBlockId,
      createdAt: input.createdAt,
      reservedIds: index.blockIds,
      updatedAt: input.createdAt,
    },
  );
  const source = initialized.source;
  const next: TodoContent = {
    ...content,
    collections: [
      ...content.collections,
      { completions: [], id: input.collectionId, recurrences: [], source },
    ],
  };

  return {
    analysis: initialized.analysis,
    collectionId: input.collectionId,
    content: next,
  };
}

export function renameTodoCollection(
  content: TodoContent,
  index: TodoParseIndex,
  input: RenameTodoCollectionInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
  const collection = content.collections[collectionIndex];
  const name = parsePortableName(input.name, "Todo collection name");
  const current = readCtnCanonicalTitleHeader(collection.source);

  if (current.title === name) return content;
  assertCollectionNameAvailable(index, name, input.collectionId);
  readTodoCommandTimestamp(input.updatedAt, "Todo collection updatedAt");
  if (Date.parse(input.updatedAt) < Date.parse(current.metadata.updatedAt)) {
    throw new DomainValidationError(
      "Todo collection updatedAt cannot move backwards.",
    );
  }

  return replaceTodoCollection(content, collectionIndex, {
    ...collection,
    source: replaceCtnSourceTitle(collection.source, name, input.updatedAt),
  });
}

export function deleteTodoCollection(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const collectionIndex = findTodoCollectionIndex(content, collectionId);
  const collections = [...content.collections];

  collections.splice(collectionIndex, 1);
  return { ...content, collections };
}

export function moveTodoCollection(
  content: TodoContent,
  input: MoveTodoCollectionInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );

  assertTargetIndex(input.toIndex, content.collections.length, "Todo collection");
  if (collectionIndex === input.toIndex) return content;
  return {
    ...content,
    collections: moveAt(content.collections, collectionIndex, input.toIndex),
  };
}

export function updateTodoCollectionBody(
  content: TodoContent,
  index: TodoParseIndex,
  input: UpdateTodoCollectionBodyInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
  const collection = content.collections[collectionIndex];
  const parsed = index.getParsedCollection(input.collectionId);

  if (!parsed || parsed.collection.source !== collection.source) {
    throw new Error(
      `Todo collection analysis is stale: ${input.collectionId}`,
    );
  }
  const syntax = index.syntax;
  const editableSource = parsed.analysis.editableProjection.source;
  const prefix = `${parsed.name}\n`;
  const bodySource = editableSource === parsed.name
    ? ""
    : editableSource.startsWith(prefix)
      ? editableSource.slice(prefix.length)
      : (() => {
          throw new Error(
            `Todo collection ${input.collectionId} has an invalid editable title.`,
          );
        })();
  const current = {
    analysis: parsed.analysis,
    editableSource,
    name: parsed.name,
    source: bodySource,
  };

  assertCtnEditableSourceChange(current.source, input.change);
  if (current.source === input.change.source) {
    return { analysis: current.analysis, content };
  }
  readTodoCommandTimestamp(input.updatedAt, "Todo collection updatedAt");
  const titleMetadata = readCtnCanonicalTitleHeader(collection.source).metadata;

  if (Date.parse(input.updatedAt) < Date.parse(titleMetadata.updatedAt)) {
    throw new DomainValidationError(
      "Todo collection updatedAt cannot move backwards.",
    );
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
  const reconciled = reconcileCtnSourceBlockMetadata(
    current.analysis,
    analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: nextEditableSource,
      syntax,
    }),
    { edits, source: nextEditableSource },
    {
      createId: input.createBlockId,
      reservedIds: index.blockIds,
      timestamp: input.updatedAt,
      touchTitle: false,
    },
  );
  const withSource = cleanTodoCollectionSidecars(
    { ...collection, source: reconciled.source },
    reconciled.analysis,
  );

  return {
    analysis: reconciled.analysis,
    content: replaceTodoCollection(content, collectionIndex, withSource),
  };
}
