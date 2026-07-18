// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactSystemFields,
  failSystemContract,
  readRequiredSystemString,
  readSystemArray,
  readSystemObject,
  readSystemString,
  UnsupportedSystemRepositoryVersionError,
} from "./contractValue.ts";
import type {
  JournalEntryDto,
  SystemRepositoryCommitDto,
  SystemRepositoryCommitResultDto,
  SystemRepositoryContentDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRevisionDto,
  SystemRepositorySnapshotDto,
  TodoCollectionDto,
  TodoItemDto,
} from "./types.ts";

const journalFields = ["entries", "purpose", "schemaVersion"] as const;
const journalEntryFields = [
  "createdAt",
  "id",
  "source",
  "timezoneOffsetMinutes",
  "updatedAt",
] as const;
const todoFields = ["collections", "purpose", "schemaVersion"] as const;
const collectionFields = ["createdAt", "id", "items", "name", "updatedAt"] as const;
const itemFields = [
  "completed",
  "completedAt",
  "createdAt",
  "id",
  "text",
  "updatedAt",
] as const;
const snapshotFields = ["content", "revision"] as const;
const commitFields = ["baseRevision", "content"] as const;
const commitResultFields = ["revision"] as const;
const revisionPattern = /^sha256:[0-9a-f]{64}$/;
const uuidSuffix = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const journalEntryIdPattern = new RegExp(`^journal-entry-${uuidSuffix}$`);
const todoCollectionIdPattern = new RegExp(`^todo-collection-${uuidSuffix}$`);
const todoItemIdPattern = new RegExp(`^todo-item-${uuidSuffix}$`);

export function isJournalEntryId(value: string) {
  return journalEntryIdPattern.test(value);
}

export function isTodoCollectionId(value: string) {
  return todoCollectionIdPattern.test(value);
}

export function isTodoItemId(value: string) {
  return todoItemIdPattern.test(value);
}

export function isSystemRepositoryPurpose(
  value: string,
): value is SystemRepositoryPurposeDto {
  return value === "system-journal" || value === "system-todo";
}

export function parseSystemRepositoryPurpose(
  value: unknown,
  path = "$",
): SystemRepositoryPurposeDto {
  if (typeof value !== "string" || !isSystemRepositoryPurpose(value)) {
    failSystemContract(path, "unsupported system repository purpose");
  }
  return value;
}

export function parseSystemRepositoryRevision(
  value: unknown,
  path = "$",
): SystemRepositoryRevisionDto {
  if (typeof value !== "string" || !revisionPattern.test(value)) {
    failSystemContract(path, "expected sha256 revision");
  }
  return value as SystemRepositoryRevisionDto;
}

function readTimestamp(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const timestamp = readRequiredSystemString(value, key, path);
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    failSystemContract(`${path}.${key}`, "expected canonical timestamp");
  }
  return timestamp;
}

function assertNotBefore(
  later: string,
  earlier: string,
  path: string,
) {
  if (Date.parse(later) < Date.parse(earlier)) {
    failSystemContract(path, "timestamp must not be before createdAt");
  }
}

function readPrefixedId(
  value: Record<string, unknown>,
  path: string,
  pattern: RegExp,
  label: string,
) {
  const id = readRequiredSystemString(value, "id", path);
  if (!pattern.test(id)) failSystemContract(`${path}.id`, `invalid ${label} id`);
  return id;
}

function parseJournalEntry(value: unknown, path: string): JournalEntryDto {
  const entry = readSystemObject(value, path);
  assertExactSystemFields(entry, journalEntryFields, path);
  const timezoneOffsetMinutes = entry.timezoneOffsetMinutes;
  if (
    !Number.isSafeInteger(timezoneOffsetMinutes) ||
    (timezoneOffsetMinutes as number) < -840 ||
    (timezoneOffsetMinutes as number) > 840
  ) {
    failSystemContract(
      `${path}.timezoneOffsetMinutes`,
      "expected integer minutes between -840 and 840",
    );
  }
  const parsed = {
    id: readPrefixedId(entry, path, journalEntryIdPattern, "journal entry"),
    createdAt: readTimestamp(entry, "createdAt", path),
    timezoneOffsetMinutes: timezoneOffsetMinutes as number,
    updatedAt: readTimestamp(entry, "updatedAt", path),
    source: readSystemString(entry, "source", path),
  };
  assertNotBefore(parsed.updatedAt, parsed.createdAt, `${path}.updatedAt`);
  return parsed;
}

function parseTodoItem(value: unknown, path: string): TodoItemDto {
  const item = readSystemObject(value, path);
  assertExactSystemFields(item, itemFields, path);
  if (typeof item.completed !== "boolean") {
    failSystemContract(`${path}.completed`, "expected boolean");
  }
  const completedAt = item.completedAt === null
    ? null
    : readTimestamp(item, "completedAt", path);
  const text = readSystemString(item, "text", path);
  if (text.trim().length === 0) {
    failSystemContract(`${path}.text`, "expected non-empty text");
  }
  if ((item.completed === true) !== (completedAt !== null)) {
    failSystemContract(
      `${path}.completedAt`,
      "completed and completedAt must describe the same state",
    );
  }
  const parsed = {
    id: readPrefixedId(item, path, todoItemIdPattern, "todo item"),
    text,
    completed: item.completed,
    createdAt: readTimestamp(item, "createdAt", path),
    updatedAt: readTimestamp(item, "updatedAt", path),
    completedAt,
  };
  assertNotBefore(parsed.updatedAt, parsed.createdAt, `${path}.updatedAt`);
  if (parsed.completedAt !== null) {
    assertNotBefore(parsed.completedAt, parsed.createdAt, `${path}.completedAt`);
  }
  return parsed;
}

function parseTodoCollection(
  value: unknown,
  path: string,
  itemIds: Set<string>,
): TodoCollectionDto {
  const collection = readSystemObject(value, path);
  assertExactSystemFields(collection, collectionFields, path);
  const items = readSystemArray(collection, "items", path).map((value, index) => {
    const item = parseTodoItem(value, `${path}.items[${index}]`);
    if (itemIds.has(item.id)) {
      failSystemContract(`${path}.items[${index}].id`, `duplicate todo item id ${item.id}`);
    }
    itemIds.add(item.id);
    return item;
  });
  const name = readRequiredSystemString(collection, "name", path);
  if (name.trim().length === 0) {
    failSystemContract(`${path}.name`, "expected non-empty name");
  }
  const parsed = {
    id: readPrefixedId(collection, path, todoCollectionIdPattern, "todo collection"),
    name,
    createdAt: readTimestamp(collection, "createdAt", path),
    updatedAt: readTimestamp(collection, "updatedAt", path),
    items,
  };
  assertNotBefore(parsed.updatedAt, parsed.createdAt, `${path}.updatedAt`);
  return parsed;
}

export function parseSystemRepositoryContent(
  value: unknown,
  expectedPurpose?: SystemRepositoryPurposeDto,
): SystemRepositoryContentDto {
  const content = readSystemObject(value, "$"),
    purpose = parseSystemRepositoryPurpose(content.purpose, "$.purpose");
  if (expectedPurpose !== undefined && purpose !== expectedPurpose) {
    failSystemContract("$.purpose", `expected ${expectedPurpose}`);
  }
  if (content.schemaVersion !== 1) {
    throw new UnsupportedSystemRepositoryVersionError(
      "$.schemaVersion",
      content.schemaVersion,
    );
  }
  if (purpose === "system-journal") {
    assertExactSystemFields(content, journalFields, "$");
    const ids = new Set<string>();
    const entries = readSystemArray(content, "entries", "$").map((value, index) => {
      const entry = parseJournalEntry(value, `$.entries[${index}]`);
      if (ids.has(entry.id)) {
        failSystemContract(`$.entries[${index}].id`, `duplicate journal entry id ${entry.id}`);
      }
      ids.add(entry.id);
      return entry;
    });
    return { entries, purpose, schemaVersion: 1 };
  }
  assertExactSystemFields(content, todoFields, "$");
  const collectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const collections = readSystemArray(content, "collections", "$").map(
    (value, index) => {
      const collection = parseTodoCollection(
        value,
        `$.collections[${index}]`,
        itemIds,
      );
      if (collectionIds.has(collection.id)) {
        failSystemContract(
          `$.collections[${index}].id`,
          `duplicate todo collection id ${collection.id}`,
        );
      }
      collectionIds.add(collection.id);
      return collection;
    },
  );
  return { collections, purpose, schemaVersion: 1 };
}

export function parseSystemRepositorySnapshot(
  value: unknown,
  expectedPurpose?: SystemRepositoryPurposeDto,
): SystemRepositorySnapshotDto {
  const snapshot = readSystemObject(value, "$");
  assertExactSystemFields(snapshot, snapshotFields, "$");
  return {
    content: parseSystemRepositoryContent(snapshot.content, expectedPurpose),
    revision: parseSystemRepositoryRevision(snapshot.revision, "$.revision"),
  };
}

export function parseSystemRepositoryCommit(
  value: unknown,
  expectedPurpose?: SystemRepositoryPurposeDto,
): SystemRepositoryCommitDto {
  const commit = readSystemObject(value, "$");
  assertExactSystemFields(commit, commitFields, "$");
  return {
    baseRevision: parseSystemRepositoryRevision(commit.baseRevision, "$.baseRevision"),
    content: parseSystemRepositoryContent(commit.content, expectedPurpose),
  };
}

export function parseSystemRepositoryCommitResult(
  value: unknown,
): SystemRepositoryCommitResultDto {
  const result = readSystemObject(value, "$");
  assertExactSystemFields(result, commitResultFields, "$");
  return { revision: parseSystemRepositoryRevision(result.revision, "$.revision") };
}

export function createEmptySystemRepositoryContent(
  purpose: SystemRepositoryPurposeDto,
): SystemRepositoryContentDto {
  return purpose === "system-journal"
    ? { entries: [], purpose, schemaVersion: 1 }
    : { collections: [], purpose, schemaVersion: 1 };
}
