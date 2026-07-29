// SPDX-License-Identifier: GPL-3.0-or-later

import {
  failWireContract,
  parseContentRevision,
  readRequiredWireString,
  readWireArray,
  readWireObject,
} from "../common/contractValue.ts";
import type {
  TodoLocalDateDto,
  TodoRecurrenceRuleDto,
} from "../todo/types.ts";
import {
  apiV1Scopes,
  type ApiV1ChangeEventDto,
  type ApiV1BlockChangeDto,
  type ApiV1AuditEntryDto,
  type ApiV1AuditPageDto,
  type ApiV1CheckpointEventDto,
  type ApiV1CreateTokenRequestDto,
  type ApiV1CreatedTokenDto,
  type ApiV1DomainChangeSetDto,
  type ApiV1JournalCommandDto,
  type ApiV1RevisionCheckpointDto,
  type ApiV1ResourceChangeDto,
  type ApiV1Scope,
  type ApiV1SearchRequestDto,
  type ApiV1TodoCommandDto,
  type ApiV1TokenDto,
  type ApiV1WorkspaceCommandDto,
} from "./types.ts";

const contract = "CTN API v1";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localDatePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const allowedScopeSet = new Set<string>(apiV1Scopes);

function assertFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path = "$",
) {
  const allowedSet = new Set(allowed);

  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      failWireContract(contract, `${path}.${key}`, "unsupported field");
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      failWireContract(contract, `${path}.${key}`, "missing field");
    }
  }
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  if (typeof value[key] !== "boolean") {
    failWireContract(contract, `${path}.${key}`, "expected boolean");
  }
  return value[key] as boolean;
}

function readInteger(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  const result = value[key];

  if (!Number.isSafeInteger(result) || (result as number) < 0) {
    failWireContract(
      contract,
      `${path}.${key}`,
      "expected non-negative integer",
    );
  }
  return result as number;
}

function readNullableString(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  const result = value[key];

  if (result !== null && typeof result !== "string") {
    failWireContract(contract, `${path}.${key}`, "expected string or null");
  }
  return result as string | null;
}

function readUuid(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  const result = readRequiredWireString(contract, value, key, path);

  if (!uuidPattern.test(result)) {
    failWireContract(contract, `${path}.${key}`, "expected UUID");
  }
  return result;
}

function readRevision(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  return parseContentRevision(value[key], `${path}.${key}`);
}

function parseCommandBase(value: Record<string, unknown>) {
  const mode = readRequiredWireString(contract, value, "mode", "$");

  if (mode !== "preview" && mode !== "commit") {
    failWireContract(contract, "$.mode", "expected preview or commit");
  }
  return {
    commandId: readUuid(value, "commandId"),
    mode,
  } as const;
}

function parseTargetKind(
  value: Record<string, unknown>,
  key = "targetKind",
) {
  const result = readRequiredWireString(contract, value, key, "$");

  if (
    result !== "above" &&
    result !== "below" &&
    result !== "end" &&
    result !== "inside"
  ) {
    failWireContract(contract, `$.${key}`, "unsupported block target kind");
  }
  return result;
}

function parseLocalDate(value: unknown, path: string): TodoLocalDateDto {
  if (typeof value !== "string") {
    failWireContract(contract, path, "expected YYYY-MM-DD local date");
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

function parseRecurrenceRule(
  input: unknown,
  path = "$.rule",
): TodoRecurrenceRuleDto {
  const value = readWireObject(contract, input, path);
  const kind = readRequiredWireString(contract, value, "kind", path);

  if (kind === "daily") {
    assertFields(value, ["interval", "kind"], ["interval", "kind"], path);
    return {
      interval: readPositiveInteger(value, "interval", path),
      kind,
    };
  }
  if (kind === "monthly") {
    assertFields(
      value,
      ["dayOfMonth", "interval", "kind"],
      ["dayOfMonth", "interval", "kind"],
      path,
    );
    const dayOfMonth = readPositiveInteger(value, "dayOfMonth", path);

    if (dayOfMonth > 31) {
      failWireContract(
        contract,
        `${path}.dayOfMonth`,
        "expected integer from 1 through 31",
      );
    }
    return {
      dayOfMonth,
      interval: readPositiveInteger(value, "interval", path),
      kind,
    };
  }
  if (kind === "weekly") {
    assertFields(
      value,
      ["interval", "kind", "weekdays"],
      ["interval", "kind", "weekdays"],
      path,
    );
    let previous = 0;
    const weekdays = readWireArray(contract, value, "weekdays", path).map(
      (weekday, index) => {
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
      },
    );

    if (weekdays.length === 0) {
      failWireContract(contract, `${path}.weekdays`, "expected non-empty array");
    }
    return {
      interval: readPositiveInteger(value, "interval", path),
      kind,
      weekdays,
    };
  }
  return failWireContract(contract, `${path}.kind`, "unsupported rule kind");
}

export function parseApiV1WorkspaceCommand(
  input: unknown,
): ApiV1WorkspaceCommandDto {
  const value = readWireObject(contract, input, "$");
  const kind = readRequiredWireString(contract, value, "kind", "$");
  const base = parseCommandBase(value);

  if (kind === "create-folder") {
    assertFields(
      value,
      ["commandId", "expectedTreeVersion", "kind", "mode", "parentFolderId", "title"],
      ["commandId", "expectedTreeVersion", "kind", "mode", "parentFolderId", "title"],
    );
    return {
      ...base,
      expectedTreeVersion: readRevision(value, "expectedTreeVersion"),
      kind,
      parentFolderId: readNullableString(value, "parentFolderId"),
      title: readRequiredWireString(contract, value, "title", "$"),
    };
  }
  if (kind === "create-note") {
    assertFields(
      value,
      ["body", "commandId", "expectedTreeVersion", "kind", "mode", "parentFolderId", "title"],
      ["body", "commandId", "expectedTreeVersion", "kind", "mode", "parentFolderId", "title"],
    );
    return {
      ...base,
      body: typeof value.body === "string"
        ? value.body
        : failWireContract(contract, "$.body", "expected string"),
      expectedTreeVersion: readRevision(value, "expectedTreeVersion"),
      kind,
      parentFolderId: readNullableString(value, "parentFolderId"),
      title: readRequiredWireString(contract, value, "title", "$"),
    };
  }
  if (kind === "delete-folder") {
    assertFields(
      value,
      ["commandId", "confirm", "expectedTreeVersion", "folderId", "kind", "mode"],
      ["commandId", "confirm", "expectedTreeVersion", "folderId", "kind", "mode"],
    );
    if (readBoolean(value, "confirm") !== true) {
      failWireContract(contract, "$.confirm", "expected true");
    }
    return {
      ...base,
      confirm: true,
      expectedTreeVersion: readRevision(value, "expectedTreeVersion"),
      folderId: readRequiredWireString(contract, value, "folderId", "$"),
      kind,
    };
  }
  if (kind === "delete-note") {
    assertFields(
      value,
      ["commandId", "confirm", "expectedVersion", "kind", "mode", "noteId"],
      ["commandId", "confirm", "expectedVersion", "kind", "mode", "noteId"],
    );
    if (readBoolean(value, "confirm") !== true) {
      failWireContract(contract, "$.confirm", "expected true");
    }
    return {
      ...base,
      confirm: true,
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
      noteId: readRequiredWireString(contract, value, "noteId", "$"),
    };
  }
  if (kind === "move-block") {
    assertFields(
      value,
      [
        "commandId",
        "expectedSourceVersion",
        "expectedTargetVersion",
        "kind",
        "mode",
        "sourceBlockId",
        "sourceNoteId",
        "targetBlockId",
        "targetKind",
        "targetNoteId",
      ],
      [
        "commandId",
        "expectedSourceVersion",
        "expectedTargetVersion",
        "kind",
        "mode",
        "sourceBlockId",
        "sourceNoteId",
        "targetBlockId",
        "targetKind",
        "targetNoteId",
      ],
    );
    return {
      ...base,
      expectedSourceVersion: readRevision(value, "expectedSourceVersion"),
      expectedTargetVersion: readRevision(value, "expectedTargetVersion"),
      kind,
      sourceBlockId: readUuid(value, "sourceBlockId"),
      sourceNoteId: readRequiredWireString(contract, value, "sourceNoteId", "$"),
      targetBlockId: readNullableString(value, "targetBlockId"),
      targetKind: parseTargetKind(value),
      targetNoteId: readRequiredWireString(contract, value, "targetNoteId", "$"),
    };
  }
  if (kind === "move-tree-node") {
    assertFields(
      value,
      ["commandId", "expectedTreeVersion", "kind", "mode", "nodeId", "nodeKind", "parentFolderId", "toIndex"],
      ["commandId", "expectedTreeVersion", "kind", "mode", "nodeId", "nodeKind", "parentFolderId", "toIndex"],
    );
    const nodeKind = readRequiredWireString(contract, value, "nodeKind", "$");

    if (nodeKind !== "folder" && nodeKind !== "note") {
      failWireContract(contract, "$.nodeKind", "expected folder or note");
    }
    return {
      ...base,
      expectedTreeVersion: readRevision(value, "expectedTreeVersion"),
      kind,
      nodeId: readRequiredWireString(contract, value, "nodeId", "$"),
      nodeKind,
      parentFolderId: readNullableString(value, "parentFolderId"),
      toIndex: readInteger(value, "toIndex"),
    };
  }
  if (kind === "rename-folder") {
    assertFields(
      value,
      ["commandId", "expectedVersion", "folderId", "kind", "mode", "title"],
      ["commandId", "expectedVersion", "folderId", "kind", "mode", "title"],
    );
    return {
      ...base,
      expectedVersion: readRevision(value, "expectedVersion"),
      folderId: readRequiredWireString(contract, value, "folderId", "$"),
      kind,
      title: readRequiredWireString(contract, value, "title", "$"),
    };
  }
  if (kind === "rename-note") {
    assertFields(
      value,
      ["commandId", "expectedVersion", "kind", "mode", "noteId", "title"],
      ["commandId", "expectedVersion", "kind", "mode", "noteId", "title"],
    );
    return {
      ...base,
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
      noteId: readRequiredWireString(contract, value, "noteId", "$"),
      title: readRequiredWireString(contract, value, "title", "$"),
    };
  }
  if (kind === "replace-note-source") {
    assertFields(
      value,
      ["commandId", "editableText", "expectedVersion", "kind", "mode", "noteId"],
      ["commandId", "editableText", "expectedVersion", "kind", "mode", "noteId"],
    );
    if (typeof value.editableText !== "string") {
      failWireContract(contract, "$.editableText", "expected string");
    }
    return {
      ...base,
      editableText: value.editableText,
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
      noteId: readRequiredWireString(contract, value, "noteId", "$"),
    };
  }
  return failWireContract(contract, "$.kind", "unsupported Workspace command");
}

export function parseApiV1JournalCommand(
  input: unknown,
): ApiV1JournalCommandDto {
  const value = readWireObject(contract, input, "$");
  const kind = readRequiredWireString(contract, value, "kind", "$");
  const base = parseCommandBase(value);

  if (kind === "create-entry") {
    assertFields(
      value,
      ["body", "commandId", "expectedEntriesVersion", "kind", "mode"],
      ["body", "commandId", "expectedEntriesVersion", "kind", "mode"],
    );
    if (typeof value.body !== "string") {
      failWireContract(contract, "$.body", "expected string");
    }
    return {
      ...base,
      body: value.body,
      expectedEntriesVersion: readRevision(value, "expectedEntriesVersion"),
      kind,
    };
  }
  if (kind === "delete-entry") {
    assertFields(
      value,
      ["commandId", "confirm", "entryId", "expectedVersion", "kind", "mode"],
      ["commandId", "confirm", "entryId", "expectedVersion", "kind", "mode"],
    );
    if (readBoolean(value, "confirm") !== true) {
      failWireContract(contract, "$.confirm", "expected true");
    }
    return {
      ...base,
      confirm: true,
      entryId: readRequiredWireString(contract, value, "entryId", "$"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
    };
  }
  if (kind === "replace-entry-body") {
    assertFields(
      value,
      ["body", "commandId", "entryId", "expectedVersion", "kind", "mode"],
      ["body", "commandId", "entryId", "expectedVersion", "kind", "mode"],
    );
    if (typeof value.body !== "string") {
      failWireContract(contract, "$.body", "expected string");
    }
    return {
      ...base,
      body: value.body,
      entryId: readRequiredWireString(contract, value, "entryId", "$"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
    };
  }
  return failWireContract(contract, "$.kind", "unsupported Journal command");
}

export function parseApiV1TodoCommand(input: unknown): ApiV1TodoCommandDto {
  const value = readWireObject(contract, input, "$");
  const kind = readRequiredWireString(contract, value, "kind", "$");
  const base = parseCommandBase(value);

  if (kind === "create-collection") {
    assertFields(
      value,
      ["body", "commandId", "expectedOrderVersion", "kind", "mode", "name"],
      ["body", "commandId", "expectedOrderVersion", "kind", "mode", "name"],
    );
    if (typeof value.body !== "string") {
      failWireContract(contract, "$.body", "expected string");
    }
    return {
      ...base,
      body: value.body,
      expectedOrderVersion: readRevision(value, "expectedOrderVersion"),
      kind,
      name: readRequiredWireString(contract, value, "name", "$"),
    };
  }
  if (kind === "delete-collection") {
    assertFields(
      value,
      ["collectionId", "commandId", "confirm", "expectedStateVersion", "expectedVersion", "kind", "mode"],
      ["collectionId", "commandId", "confirm", "expectedStateVersion", "expectedVersion", "kind", "mode"],
    );
    if (readBoolean(value, "confirm") !== true) {
      failWireContract(contract, "$.confirm", "expected true");
    }
    return {
      ...base,
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      confirm: true,
      expectedStateVersion: readRevision(value, "expectedStateVersion"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
    };
  }
  if (kind === "set-completion") {
    assertFields(
      value,
      ["blockId", "collectionId", "commandId", "completed", "expectedStateVersion", "kind", "mode", "occurrenceDate"],
      ["blockId", "collectionId", "commandId", "completed", "expectedStateVersion", "kind", "mode", "occurrenceDate"],
    );
    return {
      ...base,
      blockId: readUuid(value, "blockId"),
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      completed: readBoolean(value, "completed"),
      expectedStateVersion: readRevision(value, "expectedStateVersion"),
      kind,
      occurrenceDate: value.occurrenceDate === null
        ? null
        : parseLocalDate(value.occurrenceDate, "$.occurrenceDate"),
    };
  }
  if (kind === "set-recurrence") {
    assertFields(
      value,
      ["blockId", "collectionId", "commandId", "expectedStateVersion", "kind", "mode", "rule"],
      ["blockId", "collectionId", "commandId", "expectedStateVersion", "kind", "mode", "rule"],
    );
    return {
      ...base,
      blockId: readUuid(value, "blockId"),
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedStateVersion: readRevision(value, "expectedStateVersion"),
      kind,
      rule: parseRecurrenceRule(value.rule),
    };
  }
  if (kind === "stop-recurrence") {
    assertFields(
      value,
      ["blockId", "collectionId", "commandId", "expectedStateVersion", "kind", "mode"],
      ["blockId", "collectionId", "commandId", "expectedStateVersion", "kind", "mode"],
    );
    return {
      ...base,
      blockId: readUuid(value, "blockId"),
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedStateVersion: readRevision(value, "expectedStateVersion"),
      kind,
    };
  }
  if (kind === "move-block") {
    assertFields(
      value,
      ["collectionId", "commandId", "expectedVersion", "kind", "mode", "sourceBlockId", "targetBlockId", "targetKind"],
      ["collectionId", "commandId", "expectedVersion", "kind", "mode", "sourceBlockId", "targetBlockId", "targetKind"],
    );
    return {
      ...base,
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
      sourceBlockId: readUuid(value, "sourceBlockId"),
      targetBlockId: readNullableString(value, "targetBlockId"),
      targetKind: parseTargetKind(value),
    };
  }
  if (kind === "move-collection") {
    assertFields(
      value,
      ["collectionId", "commandId", "expectedOrderVersion", "kind", "mode", "toIndex"],
      ["collectionId", "commandId", "expectedOrderVersion", "kind", "mode", "toIndex"],
    );
    return {
      ...base,
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedOrderVersion: readRevision(value, "expectedOrderVersion"),
      kind,
      toIndex: readInteger(value, "toIndex"),
    };
  }
  if (kind === "rename-collection") {
    assertFields(
      value,
      ["collectionId", "commandId", "expectedVersion", "kind", "mode", "name"],
      ["collectionId", "commandId", "expectedVersion", "kind", "mode", "name"],
    );
    return {
      ...base,
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
      name: readRequiredWireString(contract, value, "name", "$"),
    };
  }
  if (kind === "replace-collection-body") {
    assertFields(
      value,
      ["body", "collectionId", "commandId", "expectedVersion", "kind", "mode"],
      ["body", "collectionId", "commandId", "expectedVersion", "kind", "mode"],
    );
    if (typeof value.body !== "string") {
      failWireContract(contract, "$.body", "expected string");
    }
    return {
      ...base,
      body: value.body,
      collectionId: readRequiredWireString(contract, value, "collectionId", "$"),
      expectedVersion: readRevision(value, "expectedVersion"),
      kind,
    };
  }
  return failWireContract(contract, "$.kind", "unsupported Todo command");
}

function parseScopeArray(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  const seen = new Set<ApiV1Scope>();
  const scopes = readWireArray(contract, value, key, path).map(
    (scope, index): ApiV1Scope => {
      if (typeof scope !== "string" || !allowedScopeSet.has(scope)) {
        failWireContract(
          contract,
          `${path}.${key}[${index}]`,
          "unsupported API scope",
        );
      }
      const typed = scope as ApiV1Scope;

      if (seen.has(typed)) {
        failWireContract(
          contract,
          `${path}.${key}[${index}]`,
          "duplicate API scope",
        );
      }
      seen.add(typed);
      return typed;
    },
  );

  return scopes.sort();
}

function parseStringArray(
  value: Record<string, unknown>,
  key: string,
  path = "$",
) {
  const seen = new Set<string>();

  return readWireArray(contract, value, key, path).map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      failWireContract(
        contract,
        `${path}.${key}[${index}]`,
        "expected non-empty string",
      );
    }
    if (seen.has(entry)) {
      failWireContract(
        contract,
        `${path}.${key}[${index}]`,
        "duplicate value",
      );
    }
    seen.add(entry);
    return entry;
  });
}

export function parseApiV1CreateTokenRequest(
  input: unknown,
): ApiV1CreateTokenRequestDto {
  const value = readWireObject(contract, input, "$");

  assertFields(
    value,
    ["name", "repositoryIds", "scopes"],
    ["name", "repositoryIds", "scopes"],
  );
  const name = readRequiredWireString(contract, value, "name", "$");

  if (
    name.trim() !== name ||
    name.length === 0 ||
    [...name].length > 80
  ) {
    failWireContract(
      contract,
      "$.name",
      "expected a trimmed name of 1 through 80 Unicode characters",
    );
  }
  return {
    name,
    repositoryIds: value.repositoryIds === null
      ? null
      : parseStringArray(value, "repositoryIds"),
    scopes: parseScopeArray(value, "scopes"),
  };
}

export function parseApiV1SearchRequest(
  input: unknown,
): ApiV1SearchRequestDto {
  const value = readWireObject(contract, input, "$");

  assertFields(
    value,
    ["cursor", "domains", "limit", "query", "repositoryIds", "updatedAfter"],
    ["query"],
  );
  const result: ApiV1SearchRequestDto = {
    query: typeof value.query === "string"
      ? value.query
      : failWireContract(contract, "$.query", "expected string"),
  };

  if ("cursor" in value) {
    result.cursor = readRequiredWireString(contract, value, "cursor", "$");
  }
  if ("domains" in value) {
    const seen = new Set<string>();

    result.domains = readWireArray(contract, value, "domains", "$").map(
      (domain, index) => {
        if (
          (domain !== "journal" && domain !== "todo" && domain !== "workspace") ||
          seen.has(domain)
        ) {
          failWireContract(
            contract,
            `$.domains[${index}]`,
            "expected unique supported domain",
          );
        }
        seen.add(domain);
        return domain;
      },
    );
  }
  if ("limit" in value) {
    const limit = readInteger(value, "limit");

    if (limit < 1 || limit > 100) {
      failWireContract(contract, "$.limit", "expected integer from 1 through 100");
    }
    result.limit = limit;
  }
  if ("repositoryIds" in value) {
    result.repositoryIds = parseStringArray(value, "repositoryIds");
  }
  if ("updatedAfter" in value) {
    const updatedAfter = readRequiredWireString(
      contract,
      value,
      "updatedAfter",
      "$",
    );

    const timestamp = Date.parse(updatedAfter);

    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString() !== updatedAfter
    ) {
      failWireContract(
        contract,
        "$.updatedAfter",
        "expected canonical timestamp",
      );
    }
    result.updatedAfter = updatedAfter;
  }
  return result;
}

function parseApiV1Checkpoint(
  input: unknown,
  path: string,
): ApiV1RevisionCheckpointDto {
  const value = readWireObject(contract, input, path);

  assertFields(
    value,
    ["journal", "sequence", "todo", "workspaces"],
    ["journal", "sequence", "todo", "workspaces"],
    path,
  );
  const workspaces = readWireObject(
    contract,
    value.workspaces,
    `${path}.workspaces`,
  );
  const parsedWorkspaces = Object.fromEntries(
    Object.entries(workspaces).map(([repositoryId, revision]) => [
      repositoryId,
      parseContentRevision(
        revision,
        `${path}.workspaces.${repositoryId}`,
      ),
    ]),
  );
  const parseNullableRevision = (key: "journal" | "todo") =>
    value[key] === null
      ? null
      : parseContentRevision(value[key], `${path}.${key}`);

  return {
    journal: parseNullableRevision("journal"),
    sequence: readInteger(value, "sequence", path),
    todo: parseNullableRevision("todo"),
    workspaces: parsedWorkspaces,
  };
}

function parseApiV1DomainChangeSet(
  input: unknown,
  path: string,
): ApiV1DomainChangeSetDto {
  const value = readWireObject(contract, input, path);

  assertFields(
    value,
    ["blocks", "occurredAt", "resources"],
    ["blocks", "occurredAt", "resources"],
    path,
  );
  const occurredAt = readRequiredWireString(
    contract,
    value,
    "occurredAt",
    path,
  );

  if (
    !Number.isFinite(Date.parse(occurredAt)) ||
    new Date(occurredAt).toISOString() !== occurredAt
  ) {
    failWireContract(contract, `${path}.occurredAt`, "expected canonical timestamp");
  }
  const resources = readWireArray(contract, value, "resources", path).map(
    (inputResource, index) => {
      const resourcePath = `${path}.resources[${index}]`;
      const resource = readWireObject(contract, inputResource, resourcePath);

      assertFields(
        resource,
        ["domain", "kind", "repositoryId", "resourceId", "version"],
        ["domain", "kind", "resourceId"],
        resourcePath,
      );
      const domainSource = readRequiredWireString(
        contract,
        resource,
        "domain",
        resourcePath,
      );
      const kindSource = readRequiredWireString(
        contract,
        resource,
        "kind",
        resourcePath,
      );

      if (
        domainSource !== "journal" &&
        domainSource !== "todo" &&
        domainSource !== "workspace"
      ) {
        failWireContract(contract, `${resourcePath}.domain`, "unsupported domain");
      }
      if (
        kindSource !== "created" &&
        kindSource !== "deleted" &&
        kindSource !== "moved" &&
        kindSource !== "updated"
      ) {
        failWireContract(
          contract,
          `${resourcePath}.kind`,
          "unsupported resource change kind",
        );
      }
      const domain = domainSource as ApiV1ResourceChangeDto["domain"];
      const kind = kindSource as ApiV1ResourceChangeDto["kind"];

      return {
        domain,
        kind,
        ...("repositoryId" in resource
          ? {
              repositoryId: readRequiredWireString(
                contract,
                resource,
                "repositoryId",
                resourcePath,
              ),
            }
          : {}),
        resourceId: readRequiredWireString(
          contract,
          resource,
          "resourceId",
          resourcePath,
        ),
        ...("version" in resource
          ? {
              version: parseContentRevision(
                resource.version,
                `${resourcePath}.version`,
              ),
            }
          : {}),
      };
    },
  );
  const blocks = readWireArray(contract, value, "blocks", path).map(
    (inputBlock, index) => {
      const blockPath = `${path}.blocks[${index}]`;
      const block = readWireObject(contract, inputBlock, blockPath);

      assertFields(
        block,
        ["blockId", "createdAt", "kind", "resourceId", "updatedAt"],
        ["blockId", "kind", "resourceId", "updatedAt"],
        blockPath,
      );
      const kindSource = readRequiredWireString(
        contract,
        block,
        "kind",
        blockPath,
      );

      if (
        kindSource !== "created" &&
        kindSource !== "deleted" &&
        kindSource !== "moved" &&
        kindSource !== "state-updated" &&
        kindSource !== "updated"
      ) {
        failWireContract(
          contract,
          `${blockPath}.kind`,
          "unsupported block change kind",
        );
      }
      const kind = kindSource as ApiV1BlockChangeDto["kind"];

      return {
        blockId: readRequiredWireString(
          contract,
          block,
          "blockId",
          blockPath,
        ),
        ...("createdAt" in block
          ? {
              createdAt: readRequiredWireString(
                contract,
                block,
                "createdAt",
                blockPath,
              ),
            }
          : {}),
        kind,
        resourceId: readRequiredWireString(
          contract,
          block,
          "resourceId",
          blockPath,
        ),
        updatedAt: readRequiredWireString(
          contract,
          block,
          "updatedAt",
          blockPath,
        ),
      };
    },
  );

  return { blocks, occurredAt, resources };
}

export function parseApiV1Event(
  input: unknown,
): ApiV1ChangeEventDto | ApiV1CheckpointEventDto {
  const value = readWireObject(contract, input, "$");
  const type = readRequiredWireString(contract, value, "type", "$");

  if (type === "checkpoint") {
    assertFields(
      value,
      ["checkpoint", "sequence", "type"],
      ["checkpoint", "sequence", "type"],
    );
    const sequence = readInteger(value, "sequence");
    const checkpoint = parseApiV1Checkpoint(value.checkpoint, "$.checkpoint");

    if (checkpoint.sequence !== sequence) {
      failWireContract(contract, "$.checkpoint.sequence", "event sequence mismatch");
    }
    return { checkpoint, sequence, type };
  }
  if (type === "change") {
    assertFields(
      value,
      ["changes", "checkpoint", "sequence", "type"],
      ["changes", "checkpoint", "sequence", "type"],
    );
    const sequence = readInteger(value, "sequence");
    const checkpoint = parseApiV1Checkpoint(value.checkpoint, "$.checkpoint");

    if (checkpoint.sequence !== sequence) {
      failWireContract(contract, "$.checkpoint.sequence", "event sequence mismatch");
    }
    return {
      changes: parseApiV1DomainChangeSet(value.changes, "$.changes"),
      checkpoint,
      sequence,
      type,
    };
  }
  return failWireContract(contract, "$.type", "unsupported event type");
}

function readCanonicalTimestamp(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const result = readRequiredWireString(contract, value, key, path);

  if (
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  ) {
    failWireContract(contract, `${path}.${key}`, "expected canonical timestamp");
  }
  return result;
}

function parseApiV1Token(input: unknown, path: string): ApiV1TokenDto {
  const value = readWireObject(contract, input, path);

  assertFields(
    value,
    [
      "createdAt",
      "id",
      "lastUsedAt",
      "name",
      "prefix",
      "repositoryIds",
      "scopes",
    ],
    [
      "createdAt",
      "id",
      "lastUsedAt",
      "name",
      "prefix",
      "repositoryIds",
      "scopes",
    ],
    path,
  );
  const lastUsedAt = value.lastUsedAt === null
    ? null
    : readCanonicalTimestamp(value, "lastUsedAt", path);

  return {
    createdAt: readCanonicalTimestamp(value, "createdAt", path),
    id: readRequiredWireString(contract, value, "id", path),
    lastUsedAt,
    name: readRequiredWireString(contract, value, "name", path),
    prefix: readRequiredWireString(contract, value, "prefix", path),
    repositoryIds: value.repositoryIds === null
      ? null
      : parseStringArray(value, "repositoryIds", path),
    scopes: parseScopeArray(value, "scopes", path),
  };
}

export function parseApiV1TokenList(input: unknown): ApiV1TokenDto[] {
  const value = readWireObject(contract, input, "$");

  assertFields(value, ["tokens"], ["tokens"]);
  return readWireArray(contract, value, "tokens", "$").map(
    (token, index) => parseApiV1Token(token, `$.tokens[${index}]`),
  );
}

export function parseApiV1CreatedToken(
  input: unknown,
): ApiV1CreatedTokenDto {
  const value = readWireObject(contract, input, "$");

  assertFields(value, ["secret", "token"], ["secret", "token"]);
  return {
    secret: readRequiredWireString(contract, value, "secret", "$"),
    token: parseApiV1Token(value.token, "$.token"),
  };
}

function parseRevisionRecord(input: unknown, path: string) {
  const value = readWireObject(contract, input, path);

  return Object.fromEntries(
    Object.entries(value).map(([key, revision]) => [
      key,
      parseContentRevision(revision, `${path}.${key}`),
    ]),
  );
}

function parseApiV1AuditEntry(
  input: unknown,
  path: string,
): ApiV1AuditEntryDto {
  const value = readWireObject(contract, input, path);

  assertFields(
    value,
    [
      "afterVersions",
      "beforeVersions",
      "blockIds",
      "commandId",
      "commandKind",
      "occurredAt",
      "principalId",
      "requestId",
      "resourceIds",
      "result",
    ],
    [
      "afterVersions",
      "beforeVersions",
      "blockIds",
      "commandId",
      "commandKind",
      "occurredAt",
      "principalId",
      "requestId",
      "resourceIds",
      "result",
    ],
    path,
  );
  const result = readRequiredWireString(contract, value, "result", path);

  if (result !== "committed" && result !== "failed") {
    failWireContract(contract, `${path}.result`, "unsupported audit result");
  }
  return {
    afterVersions: parseRevisionRecord(
      value.afterVersions,
      `${path}.afterVersions`,
    ),
    beforeVersions: parseRevisionRecord(
      value.beforeVersions,
      `${path}.beforeVersions`,
    ),
    blockIds: parseStringArray(value, "blockIds", path),
    commandId: readRequiredWireString(contract, value, "commandId", path),
    commandKind: readRequiredWireString(
      contract,
      value,
      "commandKind",
      path,
    ),
    occurredAt: readCanonicalTimestamp(value, "occurredAt", path),
    principalId: readRequiredWireString(
      contract,
      value,
      "principalId",
      path,
    ),
    requestId: readRequiredWireString(contract, value, "requestId", path),
    resourceIds: parseStringArray(value, "resourceIds", path),
    result,
  };
}

export function parseApiV1AuditPage(input: unknown): ApiV1AuditPageDto {
  const value = readWireObject(contract, input, "$");

  assertFields(value, ["cursor", "entries"], ["cursor", "entries"]);
  return {
    cursor: readNullableString(value, "cursor"),
    entries: readWireArray(contract, value, "entries", "$").map(
      (entry, index) => parseApiV1AuditEntry(entry, `$.entries[${index}]`),
    ),
  };
}
