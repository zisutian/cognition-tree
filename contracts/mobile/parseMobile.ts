// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactWireFields,
  failWireContract,
  parseContentRevision,
  readWireObject,
} from "../common/contractValue.ts";
import type {
  MobileTodoCompletionRequestDto,
  MobileV2TodoCompletionRequestDto,
} from "./types.ts";

const v1Contract = "Cognition mobile v1";
const v2Contract = "Cognition mobile v2";
const completionFields = [
  "completed",
  "expectedRevision",
  "occurrenceDate",
] as const;
const localDatePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

function parseLocalDate(value: unknown, path: string, contract: string) {
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
  return value as MobileTodoCompletionRequestDto["occurrenceDate"];
}

function parseCompletionRequest(
  value: unknown,
  contract: string,
): MobileTodoCompletionRequestDto {
  const request = readWireObject(contract, value, "$");

  assertExactWireFields(contract, request, completionFields, "$");
  if (typeof request.completed !== "boolean") {
    failWireContract(contract, "$.completed", "expected boolean");
  }
  return {
    completed: request.completed,
    expectedRevision: parseContentRevision(
      request.expectedRevision,
      "$.expectedRevision",
    ),
    occurrenceDate: request.occurrenceDate === null
      ? null
      : parseLocalDate(request.occurrenceDate, "$.occurrenceDate", contract),
  };
}

export function parseMobileTodoCompletionRequest(
  value: unknown,
): MobileTodoCompletionRequestDto {
  return parseCompletionRequest(value, v1Contract);
}

export function parseMobileV2TodoCompletionRequest(
  value: unknown,
): MobileV2TodoCompletionRequestDto {
  return parseCompletionRequest(value, v2Contract);
}
