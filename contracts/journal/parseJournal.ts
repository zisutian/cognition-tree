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
} from "../common/index.ts";
import type {
  JournalContentDto,
  JournalDayDto,
  JournalEntryDto,
  JournalSnapshotDto,
  JournalSyncRequestDto,
  JournalSyncResultDto,
} from "./types.ts";

const contract = "Journal v3";
const contentFields = ["days", "schemaVersion", "syntaxSource"] as const;
const dayFields = ["date", "entries", "lastIssuedSequence"] as const;
const entryFields = [
  "createdAt",
  "id",
  "sequence",
  "source",
  "timezoneOffsetMinutes",
  "updatedAt",
] as const;
const snapshotFields = ["content", "revision"] as const;
const syncRequestFields = ["base", "content"] as const;
const syncResultFields = ["outcome", "snapshot"] as const;
const uuidSuffix =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const entryIdPattern = new RegExp(`^journal-entry-${uuidSuffix}$`);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalEntryId(
  value: string,
): value is JournalEntryDto["id"] {
  return entryIdPattern.test(value);
}

function readSequence(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 ||
      (value as number) > 9_999) {
    failWireContract(contract, path, "expected an integer between 1 and 9999");
  }
  return value as number;
}

function parseEntry(value: unknown, path: string): JournalEntryDto {
  const entry = readWireObject(contract, value, path);

  assertExactWireFields(contract, entry, entryFields, path);
  const id = readRequiredWireString(contract, entry, "id", path);
  if (!isJournalEntryId(id)) {
    failWireContract(contract, `${path}.id`, "invalid journal entry id");
  }
  const timezoneOffsetMinutes = entry.timezoneOffsetMinutes;
  if (
    !Number.isSafeInteger(timezoneOffsetMinutes) ||
    (timezoneOffsetMinutes as number) < -840 ||
    (timezoneOffsetMinutes as number) > 840
  ) {
    failWireContract(
      contract,
      `${path}.timezoneOffsetMinutes`,
      "expected integer minutes between -840 and 840",
    );
  }
  const createdAt = readCanonicalTimestamp(contract, entry, "createdAt", path);
  const updatedAt = readCanonicalTimestamp(contract, entry, "updatedAt", path);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    failWireContract(contract, `${path}.updatedAt`, "must not precede createdAt");
  }
  return {
    id,
    createdAt,
    updatedAt,
    timezoneOffsetMinutes: timezoneOffsetMinutes as number,
    sequence: readSequence(entry.sequence, `${path}.sequence`),
    source: readWireString(contract, entry, "source", path),
  };
}

function parseDay(value: unknown, path: string): JournalDayDto {
  const day = readWireObject(contract, value, path);

  assertExactWireFields(contract, day, dayFields, path);
  const date = readRequiredWireString(contract, day, "date", path);
  if (
    !datePattern.test(date) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    failWireContract(contract, `${path}.date`, "expected canonical YYYY-MM-DD date");
  }
  const ids = new Set<string>();
  const entries = readWireArray(contract, day, "entries", path).map(
    (entry, index) => {
      const parsed = parseEntry(entry, `${path}.entries[${index}]`);
      if (ids.has(parsed.id)) {
        failWireContract(contract, `${path}.entries[${index}].id`, "duplicate entry id");
      }
      ids.add(parsed.id);
      return parsed;
    },
  );
  return {
    date,
    entries,
    lastIssuedSequence: readSequence(
      day.lastIssuedSequence,
      `${path}.lastIssuedSequence`,
    ),
  };
}

export function parseJournalContent(value: unknown): JournalContentDto {
  const content = readWireObject(contract, value, "$");

  if (content.schemaVersion !== 3) {
    throw new UnsupportedWireVersionError(contract, "$.schemaVersion", content.schemaVersion);
  }
  assertExactWireFields(contract, content, contentFields, "$");
  const dates = new Set<string>();
  const entryIds = new Set<string>();
  const days = readWireArray(contract, content, "days", "$").map(
    (day, index) => {
      const parsed = parseDay(day, `$.days[${index}]`);
      if (dates.has(parsed.date)) {
        failWireContract(contract, `$.days[${index}].date`, "duplicate day");
      }
      dates.add(parsed.date);
      for (const entry of parsed.entries) {
        if (entryIds.has(entry.id)) {
          failWireContract(contract, `$.days[${index}].entries`, "duplicate entry id");
        }
        entryIds.add(entry.id);
      }
      return parsed;
    },
  );
  return {
    schemaVersion: 3,
    syntaxSource: readWireString(contract, content, "syntaxSource", "$"),
    days,
  };
}

export function parseJournalSnapshot(value: unknown): JournalSnapshotDto {
  const snapshot = readWireObject(contract, value, "$");

  assertExactWireFields(contract, snapshot, snapshotFields, "$");
  return {
    content: parseJournalContent(snapshot.content),
    revision: parseContentRevision(snapshot.revision, "$.revision"),
  };
}

export function parseJournalSyncRequest(value: unknown): JournalSyncRequestDto {
  const request = readWireObject(contract, value, "$");

  assertExactWireFields(contract, request, syncRequestFields, "$");
  return {
    base: parseJournalSnapshot(request.base),
    content: parseJournalContent(request.content),
  };
}

export function parseJournalSyncResult(value: unknown): JournalSyncResultDto {
  const result = readWireObject(contract, value, "$");

  assertExactWireFields(contract, result, syncResultFields, "$");
  const outcome = readRequiredWireString(contract, result, "outcome", "$");

  if (
    outcome !== "auto-merged" && outcome !== "committed" &&
    outcome !== "unchanged"
  ) {
    failWireContract(contract, "$.outcome", "expected sync outcome");
  }
  return { outcome, snapshot: parseJournalSnapshot(result.snapshot) };
}
