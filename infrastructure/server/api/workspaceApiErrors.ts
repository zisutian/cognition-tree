// SPDX-License-Identifier: GPL-3.0-or-later

import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../../contracts/common/contractValue.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../contracts/workspace/contractValue.ts";
import type {
  RepositoryApiErrorCodeDto,
  RepositoryApiErrorDto,
} from "../../../contracts/workspace/types.ts";
import {
  RepositoryCatalogError,
} from "../repository/repositoryCatalog.ts";
import {
  RepositoryAdapterError,
  WorkspaceRevisionConflictError,
} from "../repository/repositoryStore.ts";
import { VersionedContentRevisionConflictError } from "../repository/versionedContentStore.ts";
import { WorkspacePayloadValidationError } from "../repository/workspaceRepositoryLayout.ts";

const statusByCode: Record<RepositoryApiErrorCodeDto, number> = {
  adapter_unavailable: 503,
  insufficient_storage: 507,
  internal_error: 500,
  invalid_request: 400,
  repository_busy: 423,
  repository_corrupt: 500,
  repository_not_found: 404,
  revision_conflict: 409,
  unauthorized: 401,
  unsupported_repository_version: 409,
};

export class WorkspaceApiRequestError extends Error {
  code: RepositoryApiErrorCodeDto;
  currentRevision?: RepositoryApiErrorDto["currentRevision"];
  statusCode: number;

  constructor(
    code: RepositoryApiErrorCodeDto,
    message: string,
    statusCode = statusByCode[code],
    currentRevision?: RepositoryApiErrorDto["currentRevision"],
  ) {
    super(message);
    this.name = "WorkspaceApiRequestError";
    this.code = code;
    this.currentRevision = currentRevision;
    this.statusCode = statusCode;
  }
}

function safeRepositoryErrorMessage(
  code: RepositoryApiErrorCodeDto,
  message: string,
) {
  return code === "repository_corrupt"
    ? "Repository data is corrupt"
    : code === "internal_error"
      ? "Internal server error"
      : message;
}

export function mapWorkspaceApiError(error: unknown): WorkspaceApiRequestError {
  if (error instanceof WorkspaceApiRequestError) return error;
  if (error instanceof WorkspaceRevisionConflictError) {
    return new WorkspaceApiRequestError(
      "revision_conflict",
      "Repository content changed outside the current session",
      409,
      error.currentRevision,
    );
  }
  if (error instanceof VersionedContentRevisionConflictError) {
    return new WorkspaceApiRequestError(
      "revision_conflict",
      "Versioned content changed outside the current session",
      409,
      error.currentRevision,
    );
  }
  if (error instanceof UnsupportedRepositoryVersionError) {
    return new WorkspaceApiRequestError(
      "unsupported_repository_version",
      "Repository version is not supported",
    );
  }
  if (error instanceof UnsupportedWireVersionError) {
    return new WorkspaceApiRequestError(
      "unsupported_repository_version",
      "Content version is not supported",
    );
  }
  if (error instanceof RepositoryAdapterError) {
    return new WorkspaceApiRequestError(
      error.code,
      safeRepositoryErrorMessage(error.code, error.message),
      error.statusCode,
    );
  }
  if (error instanceof RepositoryCatalogError) {
    return new WorkspaceApiRequestError(
      error.code,
      safeRepositoryErrorMessage(error.code, error.message),
    );
  }
  if (
    error instanceof WorkspaceRepositoryContractError ||
    error instanceof WireContractError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    return new WorkspaceApiRequestError("invalid_request", error.message);
  }
  if (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOSPC" || error.code === "EDQUOT")
  ) {
    return new WorkspaceApiRequestError(
      "insufficient_storage",
      "Repository storage is full",
    );
  }
  return new WorkspaceApiRequestError(
    "internal_error",
    "Internal server error",
  );
}

function redactLogText(source: string, sensitiveValues: readonly string[]) {
  const withoutKnownSecrets = sensitiveValues
    .filter((value) => value.length > 0)
    .reduce(
      (current, value) => current.split(value).join("[redacted]"),
      source,
    );
  const repositoryId = String.raw`repository-[a-z0-9]+(?:-[a-z0-9]+)*`;
  const quotedRepositoryPath = new RegExp(
    String.raw`(["'\x60])((?:[A-Za-z]:[\\/]|/)(?:[^"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^"'\x60\r\n]*)?)\1`,
    "gi",
  );
  const unquotedRepositoryPath = new RegExp(
    String.raw`(?:[A-Za-z]:[\\/]|/)(?:[^\s"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^\s"'\x60\r\n]*)?`,
    "gi",
  );

  return withoutKnownSecrets
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(quotedRepositoryPath, "$1[repository-path]$1")
    .replace(unquotedRepositoryPath, "[repository-path]");
}

export function createSafeWorkspaceApiLogError(
  error: unknown,
  sensitiveValues: readonly string[],
) {
  if (!(error instanceof Error)) {
    return new Error(redactLogText(String(error), sensitiveValues));
  }
  const safe = new Error(redactLogText(error.message, sensitiveValues));

  safe.name = error.name;
  if (error.stack) safe.stack = redactLogText(error.stack, sensitiveValues);
  return safe;
}
