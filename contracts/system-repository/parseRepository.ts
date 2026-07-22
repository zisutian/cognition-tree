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
import {
  defaultJournalSyntaxSourceV2,
  defaultTodoSyntaxSourceV2,
} from "./defaultContent.ts";
import type {
  JournalDailyCounterDto,
  JournalEntryDto,
  SystemRepositoryCommitDto,
  SystemRepositoryCommitResultDto,
  SystemRepositoryContentDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRevisionDto,
  SystemRepositorySnapshotDto,
  TodoCollectionDto,
  TodoCompletionDto,
} from "./types.ts";

const journalFields = [
  "dailyCounters",
  "entries",
  "purpose",
  "schemaVersion",
  "syntaxSource",
] as const;
const journalDailyCounterFields = ["date", "lastIssuedSequence"] as const;
const journalEntryFields = [
  "createdAt",
  "id",
  "sequence",
  "source",
  "timezoneOffsetMinutes",
  "updatedAt",
] as const;
const todoFields = [
  "collections",
  "purpose",
  "schemaVersion",
  "syntaxSource",
] as const;
const collectionFields = ["completions", "id", "source"] as const;
const completionFields = ["blockId", "completedAt"] as const;
const snapshotFields = ["content", "revision"] as const;
const commitFields = ["baseRevision", "content"] as const;
const commitResultFields = ["revision"] as const;
const revisionPattern = /^sha256:[0-9a-f]{64}$/;
const uuidSuffix = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const journalEntryIdPattern = new RegExp(`^journal-entry-${uuidSuffix}$`);
const todoCollectionIdPattern = new RegExp(`^todo-collection-${uuidSuffix}$`);
const todoBlockIdPattern = new RegExp(`^${uuidSuffix}$`);
const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalEntryId(value: string) {
  return journalEntryIdPattern.test(value);
}

export function isTodoCollectionId(value: string) {
  return todoCollectionIdPattern.test(value);
}

export function isTodoBlockId(value: string) {
  return todoBlockIdPattern.test(value);
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
    sequence: readJournalSequence(entry.sequence, `${path}.sequence`),
    timezoneOffsetMinutes: timezoneOffsetMinutes as number,
    updatedAt: readTimestamp(entry, "updatedAt", path),
    source: readSystemString(entry, "source", path),
  };
  assertNotBefore(parsed.updatedAt, parsed.createdAt, `${path}.updatedAt`);
  return parsed;
}

function readJournalSequence(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 ||
      (value as number) > 9_999) {
    failSystemContract(path, "expected an integer between 1 and 9999");
  }
  return value as number;
}

function parseJournalDailyCounter(
  value: unknown,
  path: string,
): JournalDailyCounterDto {
  const counter = readSystemObject(value, path);
  assertExactSystemFields(counter, journalDailyCounterFields, path);
  const date = readRequiredSystemString(counter, "date", path);

  if (!journalDatePattern.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    failSystemContract(`${path}.date`, "expected canonical YYYY-MM-DD date");
  }
  return {
    date,
    lastIssuedSequence: readJournalSequence(
      counter.lastIssuedSequence,
      `${path}.lastIssuedSequence`,
    ),
  };
}

function parseTodoCompletion(
  value: unknown,
  path: string,
): TodoCompletionDto {
  const completion = readSystemObject(value, path);
  assertExactSystemFields(completion, completionFields, path);
  const blockId = readRequiredSystemString(completion, "blockId", path);

  if (!todoBlockIdPattern.test(blockId)) {
    failSystemContract(`${path}.blockId`, "invalid todo block id");
  }
  return {
    blockId,
    completedAt: readTimestamp(completion, "completedAt", path),
  };
}

function parseTodoCollection(
  value: unknown,
  path: string,
): TodoCollectionDto {
  const collection = readSystemObject(value, path);
  assertExactSystemFields(collection, collectionFields, path);
  const completionIds = new Set<string>();
  const completions = readSystemArray(collection, "completions", path).map(
    (value, index) => {
      const completion = parseTodoCompletion(
        value,
        `${path}.completions[${index}]`,
      );

      if (completionIds.has(completion.blockId)) {
        failSystemContract(
          `${path}.completions[${index}].blockId`,
          `duplicate todo completion block id ${completion.blockId}`,
        );
      }
      completionIds.add(completion.blockId);
      return completion;
    },
  );

  return {
    completions,
    id: readPrefixedId(
      collection,
      path,
      todoCollectionIdPattern,
      "todo collection",
    ),
    source: readSystemString(collection, "source", path),
  };
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
  if (purpose === "system-journal") {
    if (content.schemaVersion !== 2) {
      throw new UnsupportedSystemRepositoryVersionError(
        "$.schemaVersion",
        content.schemaVersion,
      );
    }
    assertExactSystemFields(content, journalFields, "$");
    const dates = new Set<string>();
    const dailyCounters = readSystemArray(content, "dailyCounters", "$").map(
      (value, index) => {
        const counter = parseJournalDailyCounter(
          value,
          `$.dailyCounters[${index}]`,
        );
        if (dates.has(counter.date)) {
          failSystemContract(
            `$.dailyCounters[${index}].date`,
            `duplicate journal counter date ${counter.date}`,
          );
        }
        dates.add(counter.date);
        return counter;
      },
    );
    const ids = new Set<string>();
    const entries = readSystemArray(content, "entries", "$").map((value, index) => {
      const entry = parseJournalEntry(value, `$.entries[${index}]`);
      if (ids.has(entry.id)) {
        failSystemContract(`$.entries[${index}].id`, `duplicate journal entry id ${entry.id}`);
      }
      ids.add(entry.id);
      return entry;
    });
    return {
      dailyCounters,
      entries,
      purpose,
      schemaVersion: 2,
      syntaxSource: readSystemString(content, "syntaxSource", "$"),
    };
  }
  if (content.schemaVersion !== 2) {
    throw new UnsupportedSystemRepositoryVersionError(
      "$.schemaVersion",
      content.schemaVersion,
    );
  }
  assertExactSystemFields(content, todoFields, "$");
  const collectionIds = new Set<string>();
  const collections = readSystemArray(content, "collections", "$").map(
    (value, index) => {
      const collection = parseTodoCollection(
        value,
        `$.collections[${index}]`,
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
  return {
    collections,
    purpose,
    schemaVersion: 2,
    syntaxSource: readSystemString(content, "syntaxSource", "$"),
  };
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
    ? {
        dailyCounters: [],
        entries: [],
        purpose,
        schemaVersion: 2,
        syntaxSource: defaultJournalSyntaxSourceV2,
      }
    : {
        collections: [],
        purpose,
        schemaVersion: 2,
        syntaxSource: defaultTodoSyntaxSourceV2,
      };
}
