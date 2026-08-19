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
} from "../common/contractValue.ts";
import type {
  TodoCollectionDto,
  TodoCommitDto,
  TodoCommitResultDto,
  TodoCompletionDto,
  TodoContentDto,
  TodoLocalDateDto,
  TodoRecurrenceCompletionDto,
  TodoRecurrenceDto,
  TodoRecurrenceRuleDto,
  TodoRecurrenceStageDto,
  TodoRecurrenceStageIdDto,
  TodoSnapshotDto,
} from "./types.ts";

const contract = "Todo v4";
const contentFields = ["collections", "schemaVersion", "syntaxSource"] as const;
const collectionFields = [
  "completions",
  "id",
  "recurrences",
  "source",
] as const;
const completionFields = ["blockId", "completedAt"] as const;
const recurrenceFields = ["blockId", "completions", "stages"] as const;
const recurrenceCompletionFields = [
  "completedAt",
  "occurrenceDate",
  "stageId",
] as const;
const recurrenceStageFields = [
  "endsBefore",
  "id",
  "rule",
  "startsOn",
] as const;
const dailyRuleFields = ["interval", "kind"] as const;
const weeklyRuleFields = ["interval", "kind", "weekdays"] as const;
const monthlyRuleFields = ["dayOfMonth", "interval", "kind"] as const;
const snapshotFields = ["content", "revision"] as const;
const commitFields = ["baseRevision", "content"] as const;
const resultFields = ["revision"] as const;
const uuidSuffix =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const collectionIdPattern = new RegExp(`^todo-collection-${uuidSuffix}$`);
const blockIdPattern = new RegExp(`^${uuidSuffix}$`);
const stageIdPattern = new RegExp(`^todo-recurrence-stage-${uuidSuffix}$`);
const localDatePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

export function isTodoCollectionId(
  value: string,
): value is TodoCollectionDto["id"] {
  return collectionIdPattern.test(value);
}

export function isTodoBlockId(value: string) {
  return blockIdPattern.test(value);
}

function readPositiveInteger(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const result = value[key];

  if (!Number.isSafeInteger(result) || (result as number) < 1) {
    failWireContract(contract, `${path}.${key}`, "expected positive integer");
  }
  return result as number;
}

function parseLocalDate(
  value: unknown,
  path: string,
): TodoLocalDateDto {
  if (typeof value !== "string") {
    failWireContract(contract, path, "expected local date string");
  }
  const match = localDatePattern.exec(value);

  if (!match) {
    failWireContract(contract, path, "expected YYYY-MM-DD local date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    year < 1 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    failWireContract(contract, path, "invalid Gregorian local date");
  }
  return value as TodoLocalDateDto;
}

function parseStageId(
  value: unknown,
  path: string,
): TodoRecurrenceStageIdDto {
  if (typeof value !== "string" || !stageIdPattern.test(value)) {
    failWireContract(contract, path, "invalid Todo recurrence stage id");
  }
  return value as TodoRecurrenceStageIdDto;
}

function parseCompletion(value: unknown, path: string): TodoCompletionDto {
  const completion = readWireObject(contract, value, path);

  assertExactWireFields(contract, completion, completionFields, path);
  const blockId = readRequiredWireString(contract, completion, "blockId", path);
  if (!blockIdPattern.test(blockId)) {
    failWireContract(contract, `${path}.blockId`, "invalid Todo block id");
  }
  return {
    blockId,
    completedAt: readCanonicalTimestamp(contract, completion, "completedAt", path),
  };
}

function parseRule(value: unknown, path: string): TodoRecurrenceRuleDto {
  const rule = readWireObject(contract, value, path);
  const kind = readRequiredWireString(contract, rule, "kind", path);

  if (kind === "daily") {
    assertExactWireFields(contract, rule, dailyRuleFields, path);
    return { interval: readPositiveInteger(rule, "interval", path), kind };
  }
  if (kind === "monthly") {
    assertExactWireFields(contract, rule, monthlyRuleFields, path);
    const dayOfMonth = readPositiveInteger(rule, "dayOfMonth", path);

    if (dayOfMonth > 31) {
      failWireContract(
        contract,
        `${path}.dayOfMonth`,
        "expected integer from 1 through 31",
      );
    }
    return {
      dayOfMonth,
      interval: readPositiveInteger(rule, "interval", path),
      kind,
    };
  }
  if (kind === "weekly") {
    assertExactWireFields(contract, rule, weeklyRuleFields, path);
    let previous = 0;
    const weekdays = readWireArray(contract, rule, "weekdays", path)
      .map((weekday, index) => {
        if (
          !Number.isSafeInteger(weekday) ||
          (weekday as number) < 1 ||
          (weekday as number) > 7 ||
          (weekday as number) <= previous
        ) {
          failWireContract(
            contract,
            `${path}.weekdays[${index}]`,
            "expected unique ascending ISO weekday",
          );
        }
        previous = weekday as number;
        return weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7;
      });

    if (weekdays.length === 0) {
      failWireContract(contract, `${path}.weekdays`, "expected non-empty array");
    }
    return {
      interval: readPositiveInteger(rule, "interval", path),
      kind,
      weekdays,
    };
  }
  return failWireContract(contract, `${path}.kind`, "unsupported rule kind");
}

function parseRecurrenceStage(
  value: unknown,
  path: string,
): TodoRecurrenceStageDto {
  const stage = readWireObject(contract, value, path);

  assertExactWireFields(contract, stage, recurrenceStageFields, path);
  return {
    endsBefore: stage.endsBefore === null
      ? null
      : parseLocalDate(stage.endsBefore, `${path}.endsBefore`),
    id: parseStageId(stage.id, `${path}.id`),
    rule: parseRule(stage.rule, `${path}.rule`),
    startsOn: parseLocalDate(stage.startsOn, `${path}.startsOn`),
  };
}

function parseRecurrenceCompletion(
  value: unknown,
  path: string,
): TodoRecurrenceCompletionDto {
  const completion = readWireObject(contract, value, path);

  assertExactWireFields(
    contract,
    completion,
    recurrenceCompletionFields,
    path,
  );
  return {
    completedAt: readCanonicalTimestamp(
      contract,
      completion,
      "completedAt",
      path,
    ),
    occurrenceDate: parseLocalDate(
      completion.occurrenceDate,
      `${path}.occurrenceDate`,
    ),
    stageId: parseStageId(completion.stageId, `${path}.stageId`),
  };
}

function parseRecurrence(
  value: unknown,
  path: string,
): TodoRecurrenceDto {
  const recurrence = readWireObject(contract, value, path);

  assertExactWireFields(contract, recurrence, recurrenceFields, path);
  const blockId = readRequiredWireString(contract, recurrence, "blockId", path);

  if (!blockIdPattern.test(blockId)) {
    failWireContract(contract, `${path}.blockId`, "invalid Todo block id");
  }
  const stageIds = new Set<string>();
  const stages = readWireArray(contract, recurrence, "stages", path)
    .map((stage, index) => {
      const parsed = parseRecurrenceStage(stage, `${path}.stages[${index}]`);

      if (stageIds.has(parsed.id)) {
        failWireContract(
          contract,
          `${path}.stages[${index}].id`,
          "duplicate recurrence stage id",
        );
      }
      stageIds.add(parsed.id);
      return parsed;
    });
  if (stages.length === 0) {
    failWireContract(contract, `${path}.stages`, "expected non-empty array");
  }
  const completionKeys = new Set<string>();
  const completions = readWireArray(
    contract,
    recurrence,
    "completions",
    path,
  ).map((completion, index) => {
    const parsed = parseRecurrenceCompletion(
      completion,
      `${path}.completions[${index}]`,
    );
    if (!stageIds.has(parsed.stageId)) {
      failWireContract(
        contract,
        `${path}.completions[${index}].stageId`,
        "unknown recurrence stage id",
      );
    }
    const key = `${parsed.stageId}:${parsed.occurrenceDate}`;

    if (completionKeys.has(key)) {
      failWireContract(
        contract,
        `${path}.completions[${index}]`,
        "duplicate recurrence completion",
      );
    }
    completionKeys.add(key);
    return parsed;
  });

  return { blockId, completions, stages };
}

function parseCollection(value: unknown, path: string): TodoCollectionDto {
  const collection = readWireObject(contract, value, path);

  assertExactWireFields(contract, collection, collectionFields, path);
  const id = readRequiredWireString(contract, collection, "id", path);

  if (!isTodoCollectionId(id)) {
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
  const recurrenceIds = new Set<string>();
  const recurrences = readWireArray(
    contract,
    collection,
    "recurrences",
    path,
  ).map((recurrence, index) => {
    const parsed = parseRecurrence(
      recurrence,
      `${path}.recurrences[${index}]`,
    );

    if (recurrenceIds.has(parsed.blockId)) {
      failWireContract(
        contract,
        `${path}.recurrences[${index}].blockId`,
        "duplicate recurrence block id",
      );
    }
    recurrenceIds.add(parsed.blockId);
    return parsed;
  });

  return {
    completions,
    id,
    recurrences,
    source: readWireString(contract, collection, "source", path),
  };
}

export function parseTodoContent(value: unknown): TodoContentDto {
  const content = readWireObject(contract, value, "$");

  if (content.schemaVersion !== 4) {
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
      const parsed = parseCollection(collection, `$.collections[${index}]`);

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
    schemaVersion: 4,
    syntaxSource: readWireString(contract, content, "syntaxSource", "$"),
  };
}

export function parseTodoSnapshot(value: unknown): TodoSnapshotDto {
  const snapshot = readWireObject(contract, value, "$");

  assertExactWireFields(contract, snapshot, snapshotFields, "$");
  return {
    content: parseTodoContent(snapshot.content),
    revision: parseContentRevision(snapshot.revision, "$.revision"),
  };
}

export function parseTodoCommit(value: unknown): TodoCommitDto {
  const commit = readWireObject(contract, value, "$");

  assertExactWireFields(contract, commit, commitFields, "$");
  return {
    baseRevision: parseContentRevision(commit.baseRevision, "$.baseRevision"),
    content: parseTodoContent(commit.content),
  };
}

export function parseTodoCommitResult(value: unknown): TodoCommitResultDto {
  const result = readWireObject(contract, value, "$");

  assertExactWireFields(contract, result, resultFields, "$");
  return { revision: parseContentRevision(result.revision, "$.revision") };
}
