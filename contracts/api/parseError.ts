// SPDX-License-Identifier: GPL-3.0-or-later

import {
  failWireContract,
  readRequiredWireString,
  readWireObject,
} from "../common/contractValue.ts";
import type {
  ApiV1ErrorCodeDto,
  ApiV1ErrorDto,
} from "./types.ts";

const contract = "CTN API v1";
const codes = new Set<ApiV1ErrorCodeDto>([
  "adapter_unavailable",
  "domain_validation_failed",
  "forbidden",
  "idempotency_conflict",
  "insufficient_storage",
  "internal_error",
  "invalid_request",
  "not_found",
  "occurrence_conflict",
  "repository_busy",
  "repository_corrupt",
  "resource_conflict",
  "unauthorized",
]);

export function parseApiV1Error(value: unknown): ApiV1ErrorDto {
  const error = readWireObject(contract, value, "$");
  const allowed = new Set(["code", "details", "message", "requestId"]);

  for (const key of Object.keys(error)) {
    if (!allowed.has(key)) {
      failWireContract(contract, `$.${key}`, "unsupported error field");
    }
  }
  for (const key of ["code", "message", "requestId"]) {
    if (!(key in error)) {
      failWireContract(contract, `$.${key}`, "missing error field");
    }
  }
  const code = readRequiredWireString(
    contract,
    error,
    "code",
    "$",
  ) as ApiV1ErrorCodeDto;

  if (!codes.has(code)) {
    failWireContract(contract, "$.code", "unsupported error code");
  }
  const details = "details" in error
    ? readWireObject(contract, error.details, "$.details")
    : undefined;

  return {
    code,
    ...(details ? { details } : {}),
    message: readRequiredWireString(contract, error, "message", "$"),
    requestId: readRequiredWireString(contract, error, "requestId", "$"),
  };
}
