// SPDX-License-Identifier: GPL-3.0-or-later

import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";
import {
  ApiAuditPageSchema,
  ApiCreateTokenRequestSchema,
  ApiCreatedTokenSchema,
  ApiTokenListSchema,
  type ApiAuditPageDto,
  type ApiCreateTokenRequestDto,
  type ApiCreatedTokenDto,
  type ApiTokenDto,
} from "./schemas/admin.ts";
import {
  ApiJournalCommandRequestSchema,
  ApiTodoCommandRequestSchema,
  ApiWorkspaceCommandRequestSchema,
  type ApiJournalCommandRequestDto,
  type ApiTodoCommandRequestDto,
  type ApiWorkspaceCommandRequestDto,
} from "./schemas/commands.ts";
import {
  ApiEventSchema,
  type ApiEventDto,
} from "./schemas/events.ts";
import {
  ApiSearchRequestSchema,
  type ApiSearchRequestDto,
} from "./schemas/search.ts";

const contract = "CTN API v2";

function jsonPointerPath(pointer: string) {
  if (pointer === "") return "$";

  return pointer.split("/").slice(1).reduce((path, segment) => {
    const value = segment.replace(/~1/g, "/").replace(/~0/g, "~");

    return /^[0-9]+$/.test(value)
      ? `${path}[${value}]`
      : `${path}.${value}`;
  }, "$");
}

function errorMessage(message: string) {
  if (/unexpected property/i.test(message)) return "unsupported field";
  if (/required property/i.test(message)) return "missing field";
  return message.charAt(0).toLowerCase() + message.slice(1);
}

export function parseApiSchema<T extends TSchema>(
  schema: T,
  input: unknown,
): Static<T> {
  const error = Value.Errors(schema, input).First();

  if (error) {
    failWireContract(
      contract,
      jsonPointerPath(error.path),
      errorMessage(error.message),
    );
  }
  return input as Static<T>;
}

function assertWeeklyWeekdaysAscending(request: ApiTodoCommandRequestDto) {
  const { command } = request;

  if (command.kind !== "set-recurrence" || command.rule.kind !== "weekly") {
    return;
  }
  for (let index = 1; index < command.rule.weekdays.length; index += 1) {
    if (command.rule.weekdays[index - 1]! >= command.rule.weekdays[index]!) {
      failWireContract(
        contract,
        `$.command.rule.weekdays[${index}]`,
        "expected unique ascending ISO weekday",
      );
    }
  }
}

export function parseApiWorkspaceCommandRequest(
  input: unknown,
): ApiWorkspaceCommandRequestDto {
  return parseApiSchema(ApiWorkspaceCommandRequestSchema, input);
}

export function parseApiJournalCommandRequest(
  input: unknown,
): ApiJournalCommandRequestDto {
  return parseApiSchema(ApiJournalCommandRequestSchema, input);
}

export function parseApiTodoCommandRequest(
  input: unknown,
): ApiTodoCommandRequestDto {
  const request = parseApiSchema(ApiTodoCommandRequestSchema, input);

  assertWeeklyWeekdaysAscending(request);
  return request;
}

export function parseApiCreateTokenRequest(
  input: unknown,
): ApiCreateTokenRequestDto {
  const request = parseApiSchema(ApiCreateTokenRequestSchema, input);

  if (request.name.trim() !== request.name) {
    failWireContract(contract, "$.name", "expected a trimmed name");
  }
  return {
    ...request,
    repositoryIds: request.repositoryIds
      ? [...request.repositoryIds].sort()
      : null,
    scopes: [...request.scopes].sort(),
  };
}

export function parseApiSearchRequest(
  input: unknown,
): ApiSearchRequestDto {
  return parseApiSchema(ApiSearchRequestSchema, input);
}

export function parseApiEvent(input: unknown): ApiEventDto {
  const event = parseApiSchema(ApiEventSchema, input);

  if (event.checkpoint.sequence !== event.sequence) {
    failWireContract(
      contract,
      "$.checkpoint.sequence",
      "event sequence mismatch",
    );
  }
  if (
    event.checkpoint.streamId !== event.streamId
  ) {
    failWireContract(
      contract,
      "$.checkpoint.streamId",
      "event stream mismatch",
    );
  }
  return event;
}

export function parseApiTokenList(input: unknown): ApiTokenDto[] {
  return parseApiSchema(ApiTokenListSchema, input).tokens;
}

export function parseApiCreatedToken(
  input: unknown,
): ApiCreatedTokenDto {
  return parseApiSchema(ApiCreatedTokenSchema, input);
}

export function parseApiAuditPage(input: unknown): ApiAuditPageDto {
  return parseApiSchema(ApiAuditPageSchema, input);
}
