// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalContent,
  JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex.ts";
import type {
  TodoCollection,
  TodoCollectionId,
  TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../core/todo/model/todoContent.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  touchCtnSourceBlockMetadata,
} from "../../core/ctn/metadata/sourceMetadata.ts";
import type { CtnCanonicalSourceAnalysis } from "../../core/ctn/analysis/sourceAnalysis.ts";
import type { WorkspaceSyntax } from "../../core/workspace/context/workspaceSyntax.ts";
import type { NoteId } from "../../core/workspace/model/workspaceData.ts";
import type {
  WorkspaceRepositoryContent,
} from "../repository/workspaceRepository.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../repository/workspaceRepositoryPreparation.ts";
import type {
  PreparedVersionedContent,
  VersionedContentConflictPreference,
  VersionedContentMergePolicy,
  VersionedContentMergeResult,
} from "../persistence/versionedRepository.ts";

const missing = Symbol("missing");

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reusePreparedContent<Content, Projection>(
  content: Content,
  candidates: readonly PreparedVersionedContent<Content, Projection>[],
) {
  return candidates.find((candidate) => equal(candidate.content, content)) ??
    null;
}

function collectJournalAnalysisOverrides(
  content: JournalContent,
  candidates: readonly PreparedVersionedContent<
    JournalContent,
    JournalParseIndex
  >[],
) {
  const overrides = new Map<JournalEntryId, CtnCanonicalSourceAnalysis>();

  for (const day of content.days) {
    for (const entry of day.entries) {
      for (const candidate of candidates) {
        const parsed = candidate.projection.getParsedEntry(entry.id);

        if (parsed?.source === entry.source) {
          overrides.set(entry.id, parsed.analysis);
          break;
        }
      }
    }
  }
  return overrides;
}

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

function collectWorkspacePreparationOverrides(
  content: WorkspaceRepositoryContent,
  candidates: readonly PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >[],
) {
  const analysisOverrides = new Map<NoteId, CtnCanonicalSourceAnalysis>();
  const syntaxOverrides = new Map<string, WorkspaceSyntax>();

  for (const note of content.workspace.notes) {
    for (const candidate of candidates) {
      const parsed = candidate.projection.analysisIndex?.getParsedNote(note.id);

      if (parsed?.source === note.source) {
        analysisOverrides.set(note.id, parsed.analysis);
        break;
      }
    }
  }
  for (const file of content.syntax.files) {
    for (const candidate of candidates) {
      const syntax = candidate.projection.syntaxById.get(file.id);

      if (syntax?.source === file.source) {
        syntaxOverrides.set(file.id, syntax);
        break;
      }
    }
  }
  return { analysisOverrides, syntaxOverrides };
}

function mergeValue<Value>(
  unitId: string,
  base: Value,
  local: Value,
  remote: Value,
  conflictPreference?: VersionedContentConflictPreference,
): { conflict: string | null; value: Value } {
  if (equal(local, remote)) return { conflict: null, value: local };
  if (equal(local, base)) return { conflict: null, value: remote };
  if (equal(remote, base)) return { conflict: null, value: local };
  return {
    conflict: unitId,
    value: conflictPreference === "remote" ? remote : local,
  };
}

function orderedKeys<Value>(
  ...maps: ReadonlyMap<string, Value>[]
) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const map of maps) {
    for (const key of map.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function mergeMapValues<Value>(
  unitPrefix: string,
  base: ReadonlyMap<string, Value>,
  local: ReadonlyMap<string, Value>,
  remote: ReadonlyMap<string, Value>,
  conflictPreference?: VersionedContentConflictPreference,
) {
  const values = new Map<string, Value>();
  const conflicts: string[] = [];

  for (const key of orderedKeys(local, remote, base)) {
    const merged = mergeValue(
      `${unitPrefix}:${key}`,
      base.get(key) ?? missing,
      local.get(key) ?? missing,
      remote.get(key) ?? missing,
      conflictPreference,
    );

    if (merged.conflict) conflicts.push(merged.conflict);
    if (merged.value !== missing) values.set(key, merged.value as Value);
  }
  return { conflicts, values };
}

function mergeResult<Content>(
  content: Content,
  conflicts: readonly string[],
  conflictPreference?: VersionedContentConflictPreference,
): VersionedContentMergeResult<Content> {
  const unitIds = [...new Set(conflicts)].sort();

  return unitIds.length > 0 && !conflictPreference
    ? { status: "conflict", unitIds }
    : { content, status: "merged" };
}

function crossesSyntaxBarrier({
  baseContent,
  baseSyntax,
  localContent,
  localSyntax,
  remoteContent,
  remoteSyntax,
}: {
  baseContent: unknown;
  baseSyntax: unknown;
  localContent: unknown;
  localSyntax: unknown;
  remoteContent: unknown;
  remoteSyntax: unknown;
}) {
  const localSyntaxChanged = !equal(baseSyntax, localSyntax);
  const remoteSyntaxChanged = !equal(baseSyntax, remoteSyntax);

  return (
    localSyntaxChanged && !equal(baseContent, remoteContent)
  ) || (
    remoteSyntaxChanged && !equal(baseContent, localContent)
  );
}

export const mergeWorkspaceContent:
  VersionedContentMergePolicy<WorkspaceRepositoryContent> = (
    base,
    local,
    remote,
    conflictPreference,
  ) => {
    const conflicts: string[] = [];
    if (crossesSyntaxBarrier({
      baseContent: base.workspace,
      baseSyntax: base.syntax,
      localContent: local.workspace,
      localSyntax: local.syntax,
      remoteContent: remote.workspace,
      remoteSyntax: remote.syntax,
    })) {
      return conflictPreference
        ? {
            content: conflictPreference === "local" ? local : remote,
            status: "merged",
          }
        : { status: "conflict", unitIds: ["syntax"] };
    }
    const syntax = mergeValue(
      "syntax",
      base.syntax,
      local.syntax,
      remote.syntax,
      conflictPreference,
    );

    if (syntax.conflict) conflicts.push(syntax.conflict);
    const name = mergeValue(
      "workspace:name",
      base.workspace.name,
      local.workspace.name,
      remote.workspace.name,
      conflictPreference,
    );
    const tree = mergeValue(
      "workspace:tree",
      base.workspace.tree,
      local.workspace.tree,
      remote.workspace.tree,
      conflictPreference,
    );

    if (name.conflict) conflicts.push(name.conflict);
    if (tree.conflict) conflicts.push(tree.conflict);
    if (
      base.workspace.id !== local.workspace.id ||
      base.workspace.id !== remote.workspace.id
    ) {
      conflicts.push("workspace:identity");
    }
    const notes = mergeMapValues(
      "workspace:note",
      new Map(base.workspace.notes.map((note) => [note.id, note])),
      new Map(local.workspace.notes.map((note) => [note.id, note])),
      new Map(remote.workspace.notes.map((note) => [note.id, note])),
      conflictPreference,
    );

    conflicts.push(...notes.conflicts);
    return mergeResult({
      schemaVersion: 4,
      syntax: syntax.value,
      workspace: {
        id: base.workspace.id,
        name: name.value,
        notes: [...notes.values.values()],
        tree: tree.value,
      },
    }, conflicts, conflictPreference);
  };

export function mergePreparedWorkspaceContent(
  base: PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >,
  local: PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >,
  remote: PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >,
  conflictPreference?: VersionedContentConflictPreference,
) {
  const merged = mergeWorkspaceContent(
    base.content,
    local.content,
    remote.content,
    conflictPreference,
  );

  if (merged.status === "conflict") return merged;
  const candidates = [local, remote, base];
  const reused = reusePreparedContent(merged.content, candidates);

  if (reused) return { ...reused, status: "merged" as const };
  const overrides = collectWorkspacePreparationOverrides(
    merged.content,
    candidates,
  );

  return {
    content: merged.content,
    projection: prepareWorkspaceRepositoryContent(merged.content, {
      ...overrides,
      previous: local.projection,
    }),
    status: "merged" as const,
  };
}

function journalEntries(content: JournalContent) {
  return new Map(
    content.days.flatMap((day) =>
      day.entries.map((entry) => [
        entry.id,
        { date: day.date, entry },
      ] as const)
    ),
  );
}

export const mergeJournalContent:
  VersionedContentMergePolicy<JournalContent> = (
    base,
    local,
    remote,
    conflictPreference,
  ) => {
    const conflicts: string[] = [];
    if (crossesSyntaxBarrier({
      baseContent: base.days,
      baseSyntax: base.syntaxSource,
      localContent: local.days,
      localSyntax: local.syntaxSource,
      remoteContent: remote.days,
      remoteSyntax: remote.syntaxSource,
    })) {
      return conflictPreference
        ? {
            content: conflictPreference === "local" ? local : remote,
            status: "merged",
          }
        : { status: "conflict", unitIds: ["syntax"] };
    }
    const syntax = mergeValue(
      "syntax",
      base.syntaxSource,
      local.syntaxSource,
      remote.syntaxSource,
      conflictPreference,
    );

    if (syntax.conflict) conflicts.push(syntax.conflict);
    const entries = mergeMapValues(
      "journal:entry",
      journalEntries(base),
      journalEntries(local),
      journalEntries(remote),
      conflictPreference,
    );

    conflicts.push(...entries.conflicts);
    const dayByDate = new Map<
      string,
      JournalContent["days"][number]
    >();

    for (const day of [...base.days, ...local.days, ...remote.days]) {
      const previous = dayByDate.get(day.date);

      dayByDate.set(day.date, {
        date: day.date,
        entries: [],
        lastIssuedSequence: Math.max(
          previous?.lastIssuedSequence ?? 0,
          day.lastIssuedSequence,
        ),
      });
    }

    for (const { date, entry } of entries.values.values()) {
      const day = dayByDate.get(date);

      if (!day) {
        conflicts.push(`journal:day:${date}`);
        continue;
      }
      if (day.entries.some(({ sequence }) => sequence === entry.sequence)) {
        conflicts.push(`journal:day:${date}:sequence:${entry.sequence}`);
        continue;
      }
      day.entries.push(entry);
      day.lastIssuedSequence = Math.max(
        day.lastIssuedSequence,
        entry.sequence,
      );
    }
    for (const day of dayByDate.values()) {
      day.entries.sort((left, right) => left.sequence - right.sequence);
    }
    return mergeResult({
      days: [...dayByDate.values()].sort((left, right) =>
        left.date.localeCompare(right.date)
      ),
      schemaVersion: 3,
      syntaxSource: syntax.value,
    }, conflicts, conflictPreference);
  };

export function mergePreparedJournalContent(
  base: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  local: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  remote: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  conflictPreference?: VersionedContentConflictPreference,
) {
  const merged = mergeJournalContent(
    base.content,
    local.content,
    remote.content,
    conflictPreference,
  );

  if (merged.status === "conflict") return merged;
  const candidates = [local, remote, base];
  const reused = reusePreparedContent(merged.content, candidates);

  return reused
    ? { ...reused, status: "merged" as const }
    : {
        content: merged.content,
        projection: createJournalParseIndex(
          merged.content,
          local.projection,
          collectJournalAnalysisOverrides(merged.content, candidates),
        ),
        status: "merged" as const,
      };
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
  conflictPreference?: VersionedContentConflictPreference,
  preparedIndexes?: {
    base: TodoParseIndex;
    local: TodoParseIndex;
    remote: TodoParseIndex;
  },
): VersionedContentMergeResult<TodoContent> {
    const conflicts: string[] = [];
    if (crossesSyntaxBarrier({
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
    const syntax = mergeValue(
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
    const baseIndex = preparedIndexes?.base ?? createTodoParseIndex(base);
    const localIndex = preparedIndexes?.local ??
      createTodoParseIndex(local, baseIndex);
    const remoteIndex = preparedIndexes?.remote ??
      createTodoParseIndex(remote, baseIndex);
    const baseLogical = todoLogicalCollections(baseIndex);
    const localLogical = todoLogicalCollections(localIndex);
    const remoteLogical = todoLogicalCollections(remoteIndex);
    const mergedCollections = new Map<string, TodoCollection>();

    for (
      const collectionId of orderedKeys(
        localCollections,
        remoteCollections,
        baseCollections,
      )
    ) {
      const typedCollectionId = collectionId as TodoCollection["id"];
      const baseCollection = baseCollections.get(typedCollectionId);
      const localCollection = localCollections.get(typedCollectionId);
      const remoteCollection = remoteCollections.get(typedCollectionId);
      const unitId = `todo:collection:${collectionId}`;

      if (!baseCollection) {
        if (localCollection && remoteCollection) {
          if (equal(localCollection, remoteCollection)) {
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
        if (!equal(remoteCollection, baseCollection)) {
          conflicts.push(unitId);
          if (conflictPreference === "remote" && remoteCollection) {
            mergedCollections.set(collectionId, remoteCollection);
          }
        }
        continue;
      }
      if (!remoteCollection) {
        if (!equal(localCollection, baseCollection)) {
          conflicts.push(unitId);
          if (conflictPreference !== "remote") {
            mergedCollections.set(collectionId, localCollection);
          }
        }
        continue;
      }
      const logical = mergeValue(
        `todo:collection:${collectionId}:body`,
        baseLogical.get(typedCollectionId),
        localLogical.get(typedCollectionId),
        remoteLogical.get(typedCollectionId),
        conflictPreference,
      );

      if (logical.conflict) conflicts.push(logical.conflict);
      const sourceOwner = equal(
        logical.value,
        localLogical.get(typedCollectionId),
      )
        ? localCollection
        : remoteCollection;
      const sourceOwnerParsed = sourceOwner === localCollection
        ? localIndex.getParsedCollection(typedCollectionId)
        : remoteIndex.getParsedCollection(typedCollectionId);

      if (!sourceOwnerParsed) {
        conflicts.push(unitId);
        continue;
      }
      const completions = mergeMapValues(
        `todo:completion:${collectionId}`,
        todoCompletionsByBlock(baseCollection),
        todoCompletionsByBlock(localCollection),
        todoCompletionsByBlock(remoteCollection),
        conflictPreference,
      );
      const recurrences = mergeMapValues(
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
          baseIndex.getParsedCollection(typedCollectionId),
          localIndex.getParsedCollection(typedCollectionId),
          remoteIndex.getParsedCollection(typedCollectionId),
        ],
      );

      mergedCollections.set(collectionId, {
        completions: [...completions.values.values()],
        id: sourceOwner.id,
        recurrences: [...recurrences.values.values()],
        source,
      });
    }
    const order = mergeValue(
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

    return mergeResult({
      collections: ordered,
      schemaVersion: 4,
      syntaxSource: syntax.value,
    }, conflicts, conflictPreference);
}

export const mergeTodoContent: VersionedContentMergePolicy<TodoContent> = (
  base,
  local,
  remote,
  conflictPreference,
) => mergeTodoContentWithIndexes(
  base,
  local,
  remote,
  conflictPreference,
);

export function mergePreparedTodoContent(
  base: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  local: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  remote: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  conflictPreference?: VersionedContentConflictPreference,
) {
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
  const reused = reusePreparedContent(merged.content, candidates);

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
}
