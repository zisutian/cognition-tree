// SPDX-License-Identifier: GPL-3.0-or-later

import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";
import {
  ApiV1AuditPageSchema,
  ApiV1CreateTokenRequestSchema,
  ApiV1CreatedTokenSchema,
  ApiV1EventSchema,
  ApiV1JournalCommandSchema,
  ApiV1SearchRequestSchema,
  ApiV1TodoCommandSchema,
  ApiV1TokenListSchema,
  ApiV1WorkspaceCommandSchema,
  type ApiV1AuditPageDto,
  type ApiV1CreateTokenRequestDto,
  type ApiV1CreatedTokenDto,
  type ApiV1EventDto,
  type ApiV1JournalCommandDto,
  type ApiV1SearchRequestDto,
  type ApiV1TodoCommandDto,
  type ApiV1TokenDto,
  type ApiV1WorkspaceCommandDto,
} from "./schemas.ts";

const contract = "CTN API v1";

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

export function parseApiV1Schema<T extends TSchema>(
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

function assertWeeklyWeekdaysAscending(command: ApiV1TodoCommandDto) {
  if (command.kind !== "set-recurrence" || command.rule.kind !== "weekly") {
    return;
  }
  for (let index = 1; index < command.rule.weekdays.length; index += 1) {
    if (command.rule.weekdays[index - 1]! >= command.rule.weekdays[index]!) {
      failWireContract(
        contract,
        `$.rule.weekdays[${index}]`,
        "expected unique ascending ISO weekday",
      );
    }
  }
}

export function parseApiV1WorkspaceCommand(
  input: unknown,
): ApiV1WorkspaceCommandDto {
  return parseApiV1Schema(ApiV1WorkspaceCommandSchema, input);
}

export function parseApiV1JournalCommand(
  input: unknown,
): ApiV1JournalCommandDto {
  return parseApiV1Schema(ApiV1JournalCommandSchema, input);
}

export function parseApiV1TodoCommand(
  input: unknown,
): ApiV1TodoCommandDto {
  const command = parseApiV1Schema(ApiV1TodoCommandSchema, input);

  assertWeeklyWeekdaysAscending(command);
  return command;
}

export function parseApiV1CreateTokenRequest(
  input: unknown,
): ApiV1CreateTokenRequestDto {
  const request = parseApiV1Schema(ApiV1CreateTokenRequestSchema, input);

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

export function parseApiV1SearchRequest(
  input: unknown,
): ApiV1SearchRequestDto {
  return parseApiV1Schema(ApiV1SearchRequestSchema, input);
}

export function parseApiV1Event(input: unknown): ApiV1EventDto {
  const event = parseApiV1Schema(ApiV1EventSchema, input);

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

export function parseApiV1TokenList(input: unknown): ApiV1TokenDto[] {
  return parseApiV1Schema(ApiV1TokenListSchema, input).tokens;
}

export function parseApiV1CreatedToken(
  input: unknown,
): ApiV1CreatedTokenDto {
  return parseApiV1Schema(ApiV1CreatedTokenSchema, input);
}

export function parseApiV1AuditPage(input: unknown): ApiV1AuditPageDto {
  return parseApiV1Schema(ApiV1AuditPageSchema, input);
}
