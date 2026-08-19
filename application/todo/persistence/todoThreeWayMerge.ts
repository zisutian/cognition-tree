// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/analysis/sourceAnalysis.ts";
import { touchCtnSourceBlockMetadata } from "../../../core/ctn/metadata/sourceMetadata.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import type {
  TodoCollection,
  TodoCollectionId,
  TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import { createTodoCollectionBodyProjection } from "../../../core/todo/model/todoCollectionProjection.ts";
import {
  areMergeValuesEqual,
  createThreeWayContentMergeResult,
  crossesSyntaxMergeBarrier,
  mergeThreeWayMapValues,
  mergeThreeWayValue,
  reusePreparedMergeContent,
  type ThreeWayContentMergeResult,
} from "../../persistence/threeWayMerge.ts";
import type {
  PreparedVersionedContent,
  VersionedContentConflictPreference,
  VersionedContentMergePolicy,
} from "../../persistence/versionedRepository.ts";

function collectTodoAnalysisOverrides(
  content: TodoContent,
  candidates: readonly PreparedVersionedContent<
    TodoContent,
    TodoParseIndex
  >[],
) {
  const overrides = new Map<TodoCollectionId, CtnCanonicalSourceAnalysis>();

  for (const collection of content.collections) {
    for (const candidate of candidates) {
      const parsed = candidate.projection.getParsedCollection(collection.id);

      if (parsed?.collection.source === collection.source) {
        overrides.set(collection.id, parsed.analysis);
        break;
      }
    }
  }
  return overrides;
}

function todoLogicalCollections(index: TodoParseIndex) {
  return new Map(index.collections.map((parsed) => [
    parsed.collection.id,
    {
      body: createTodoCollectionBodyProjection(parsed).source,
      name: parsed.name,
    },
  ]));
}

function todoCollectionById(content: TodoContent) {
  return new Map(content.collections.map((collection) => [
    collection.id,
    collection,
  ]));
}

function todoCompletionsByBlock(collection: TodoCollection | undefined) {
  return new Map(
    (collection?.completions ?? []).map((completion) => [
      completion.blockId,
      completion,
    ]),
  );
}

function todoRecurrencesByBlock(collection: TodoCollection | undefined) {
  return new Map(
    (collection?.recurrences ?? []).map((recurrence) => [
      recurrence.blockId,
      recurrence,
    ]),
  );
}

function touchLatestTodoBlockTimes(
  source: string,
  sourceOwner: ParsedTodoIndexCollection,
  candidates: readonly (ParsedTodoIndexCollection | null)[],
) {
  const latestById = new Map<string, string>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const block of candidate.analysis.document.blocks) {
      const previous = latestById.get(block.id);

      if (!previous || block.metadata.updatedAt > previous) {
        latestById.set(block.id, block.metadata.updatedAt);
      }
    }
  }
  let next = source;

  for (const block of sourceOwner.analysis.document.blocks) {
    const updatedAt = latestById.get(block.id);

    if (updatedAt && updatedAt > block.metadata.updatedAt) {
      next = touchCtnSourceBlockMetadata(next, block, updatedAt);
    }
  }
  return next;
}

function mergeTodoContentWithIndexes(
  base: TodoContent,
  local: TodoContent,
  remote: TodoContent,
  conflictPreference: VersionedContentConflictPreference | undefined,
  indexes: {
    base: TodoParseIndex;
    local: TodoParseIndex;
    remote: TodoParseIndex;
  },
): ThreeWayContentMergeResult<TodoContent> {
  const conflicts: string[] = [];

  if (crossesSyntaxMergeBarrier({
    baseContent: base.collections,
    baseSyntax: base.syntaxSource,
    localContent: local.collections,
    localSyntax: local.syntaxSource,
    remoteContent: remote.collections,
    remoteSyntax: remote.syntaxSource,
  })) {
    return conflictPreference
      ? {
          content: conflictPreference === "local" ? local : remote,
          status: "merged",
        }
      : { status: "conflict", unitIds: ["syntax"] };
  }
  const syntax = mergeThreeWayValue(
    "syntax",
    base.syntaxSource,
    local.syntaxSource,
    remote.syntaxSource,
    conflictPreference,
  );

  if (syntax.conflict) conflicts.push(syntax.conflict);
  if (syntax.conflict && !conflictPreference) {
    return { status: "conflict", unitIds: ["syntax"] };
  }
  const baseCollections = todoCollectionById(base);
  const localCollections = todoCollectionById(local);
  const remoteCollections = todoCollectionById(remote);
  const baseLogical = todoLogicalCollections(indexes.base);
  const localLogical = todoLogicalCollections(indexes.local);
  const remoteLogical = todoLogicalCollections(indexes.remote);
  const mergedCollections = new Map<string, TodoCollection>();
  const collectionIds = new Set([
    ...localCollections.keys(),
    ...remoteCollections.keys(),
    ...baseCollections.keys(),
  ]);

  for (const collectionId of collectionIds) {
    const typedCollectionId = collectionId as TodoCollection["id"];
    const baseCollection = baseCollections.get(typedCollectionId);
    const localCollection = localCollections.get(typedCollectionId);
    const remoteCollection = remoteCollections.get(typedCollectionId);
    const unitId = `todo:collection:${collectionId}`;

    if (!baseCollection) {
      if (localCollection && remoteCollection) {
        if (areMergeValuesEqual(localCollection, remoteCollection)) {
          mergedCollections.set(collectionId, localCollection);
        } else {
          conflicts.push(unitId);
          mergedCollections.set(
            collectionId,
            conflictPreference === "remote"
              ? remoteCollection
              : localCollection,
          );
        }
      } else {
        const created = localCollection ?? remoteCollection;

        if (created) mergedCollections.set(collectionId, created);
      }
      continue;
    }
    if (!localCollection && !remoteCollection) continue;
    if (!localCollection) {
      if (!areMergeValuesEqual(remoteCollection, baseCollection)) {
        conflicts.push(unitId);
        if (conflictPreference === "remote" && remoteCollection) {
          mergedCollections.set(collectionId, remoteCollection);
        }
      }
      continue;
    }
    if (!remoteCollection) {
      if (!areMergeValuesEqual(localCollection, baseCollection)) {
        conflicts.push(unitId);
        if (conflictPreference !== "remote") {
          mergedCollections.set(collectionId, localCollection);
        }
      }
      continue;
    }
    const logical = mergeThreeWayValue(
      `todo:collection:${collectionId}:body`,
      baseLogical.get(typedCollectionId),
      localLogical.get(typedCollectionId),
      remoteLogical.get(typedCollectionId),
      conflictPreference,
    );

    if (logical.conflict) conflicts.push(logical.conflict);
    const sourceOwner = areMergeValuesEqual(
        logical.value,
        localLogical.get(typedCollectionId),
      )
      ? localCollection
      : remoteCollection;
    const sourceOwnerParsed = sourceOwner === localCollection
      ? indexes.local.getParsedCollection(typedCollectionId)
      : indexes.remote.getParsedCollection(typedCollectionId);

    if (!sourceOwnerParsed) {
      conflicts.push(unitId);
      continue;
    }
    const completions = mergeThreeWayMapValues(
      `todo:completion:${collectionId}`,
      todoCompletionsByBlock(baseCollection),
      todoCompletionsByBlock(localCollection),
      todoCompletionsByBlock(remoteCollection),
      conflictPreference,
    );
    const recurrences = mergeThreeWayMapValues(
      `todo:recurrence:${collectionId}`,
      todoRecurrencesByBlock(baseCollection),
      todoRecurrencesByBlock(localCollection),
      todoRecurrencesByBlock(remoteCollection),
      conflictPreference,
    );

    conflicts.push(...completions.conflicts, ...recurrences.conflicts);
    const source = touchLatestTodoBlockTimes(
      sourceOwner.source,
      sourceOwnerParsed,
      [
        indexes.base.getParsedCollection(typedCollectionId),
        indexes.local.getParsedCollection(typedCollectionId),
        indexes.remote.getParsedCollection(typedCollectionId),
      ],
    );

    mergedCollections.set(collectionId, {
      completions: [...completions.values.values()],
      id: sourceOwner.id,
      recurrences: [...recurrences.values.values()],
      source,
    });
  }
  const order = mergeThreeWayValue(
    "todo:collection-order",
    base.collections.map(({ id }) => id),
    local.collections.map(({ id }) => id),
    remote.collections.map(({ id }) => id),
    conflictPreference,
  );

  if (order.conflict) conflicts.push(order.conflict);
  const ordered = [
    ...order.value.flatMap((id) => {
      const collection = mergedCollections.get(id);

      return collection ? [collection] : [];
    }),
    ...[...mergedCollections.values()].filter((collection) =>
      !order.value.includes(collection.id)
    ),
  ];

  return createThreeWayContentMergeResult({
    collections: ordered,
    schemaVersion: 4,
    syntaxSource: syntax.value,
  }, conflicts, conflictPreference);
}

export const mergeTodoContent: VersionedContentMergePolicy<
  TodoContent,
  TodoParseIndex
> = (base, local, remote, conflictPreference) => {
  const merged = mergeTodoContentWithIndexes(
    base.content,
    local.content,
    remote.content,
    conflictPreference,
    {
      base: base.projection,
      local: local.projection,
      remote: remote.projection,
    },
  );

  if (merged.status === "conflict") return merged;
  const candidates = [local, remote, base];
  const reused = reusePreparedMergeContent(merged.content, candidates);

  return reused
    ? { ...reused, status: "merged" as const }
    : {
        content: merged.content,
        projection: createTodoParseIndex(
          merged.content,
          local.projection,
          collectTodoAnalysisOverrides(merged.content, candidates),
        ),
        status: "merged" as const,
      };
};
