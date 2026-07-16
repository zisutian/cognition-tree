// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractObject,
  readRequiredContractString,
} from "./contractValue.ts";
import { parseRepositoryRevision } from "./revision.ts";
import type {
  RepositoryApiErrorCodeDto,
  RepositoryApiErrorDto,
} from "./types.ts";

const baseFields = ["code", "message", "requestId"] as const;
const conflictFields = ["code", "currentRevision", "message", "requestId"] as const;
const codes = new Set<RepositoryApiErrorCodeDto>([
  "invalid_request",
  "repository_not_found",
  "unsupported_repository_version",
  "revision_conflict",
  "repository_busy",
  "repository_corrupt",
  "adapter_unavailable",
  "insufficient_storage",
  "unauthorized",
  "internal_error",
]);

export function parseRepositoryApiError(value: unknown): RepositoryApiErrorDto {
  const error = readContractObject(value, "$" );
  const code = readRequiredContractString(error, "code", "$" ) as RepositoryApiErrorCodeDto;

  if (!codes.has(code)) {
    failContract("$.code", `unsupported repository error code ${code}`);
  }

  const hasRevision = "currentRevision" in error;
  assertExactContractFields(error, hasRevision ? conflictFields : baseFields, "$" );

  if (hasRevision && code !== "revision_conflict") {
    failContract("$.currentRevision", "only revision conflicts include currentRevision");
  }
  if (!hasRevision && code === "revision_conflict") {
    failContract("$.currentRevision", "missing field");
  }

  return {
    code,
    ...(hasRevision
      ? {
          currentRevision: parseRepositoryRevision(
            readRequiredContractString(error, "currentRevision", "$" ),
            "$.currentRevision",
          ),
        }
      : {}),
    message: readRequiredContractString(error, "message", "$" ),
    requestId: readRequiredContractString(error, "requestId", "$" ),
  };
}
