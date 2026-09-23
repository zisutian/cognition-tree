// SPDX-License-Identifier: GPL-3.0-or-later

import { projectContentDocument, type ContentDocument } from "../commands/index.ts";
import {
  projectTodoItemStates,
  type TodoDomainVersions,
  type TodoItemState,
} from "../todo/index.ts";
import {
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  type ParsedTodoIndexCollection,
  type TodoContent,
  type TodoLocalDate,
  type TodoParseIndex,
} from "../../core/todo/index.ts";

type ResourceVersion = `sha256:${string}`;

export type TodoCollectionSummaryResource = {
  id: string;
  name: string;
  stateVersion: ResourceVersion;
  version: ResourceVersion;
};

export type TodoCollectionsResource = {
  collections: TodoCollectionSummaryResource[];
  orderVersion: ResourceVersion;
  revision: ResourceVersion;
};

export type TodoCollectionResource = {
  document: ContentDocument;
  items: TodoItemState[];
  stateVersion: ResourceVersion;
};

export function readTodoCollectionsResource(
  content: TodoContent,
  index: TodoParseIndex,
  revision: ResourceVersion,
  versions: TodoDomainVersions,
): TodoCollectionsResource {
  return {
    collections: index.collections.map(({ collection, name }) => ({
      id: collection.id,
      name,
      stateVersion: versions.collectionState(collection),
      version: versions.collection(index.getParsedCollection(collection.id)!),
    })),
    orderVersion: versions.order(content),
    revision,
  };
}

export function projectTodoCollectionResource(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
  versions: TodoDomainVersions,
): TodoCollectionResource {
  return {
    document: projectTodoCollectionDocument(parsed, versions),
    items: projectTodoItemStates(parsed, today, versions.itemState),
    stateVersion: versions.collectionState(parsed.collection),
  };
}

export function projectTodoCollectionDocument(
  parsed: ParsedTodoIndexCollection,
  versions: TodoDomainVersions,
): ContentDocument {
  const body = createTodoCollectionBodyProjection(parsed);
  const blocks = parsed.analysis.document.blocks;

  return projectContentDocument({
      analysis: parsed.analysis,
      createdAt: blocks[0]!.metadata.createdAt,
      editableText: body.source,
      resourceId: parsed.collection.id,
      textMode: "body",
      title: parsed.name,
      updatedAt: blocks.reduce(
        (latest, block) =>
          Date.parse(block.metadata.updatedAt) > Date.parse(latest)
            ? block.metadata.updatedAt
            : latest,
        blocks[0]!.metadata.updatedAt,
      ),
      version: versions.collection(parsed),
    });
}

export function readTodoCollectionResource(
  index: TodoParseIndex,
  collectionId: string,
  today: TodoLocalDate,
  versions: TodoDomainVersions,
): TodoCollectionResource | null {
  const parsed = isTodoCollectionId(collectionId)
    ? index.getParsedCollection(collectionId)
    : null;

  return parsed ? projectTodoCollectionResource(parsed, today, versions) : null;
}
