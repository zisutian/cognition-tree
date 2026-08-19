// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "../../../application/persistence/versionedRepository";
import type {
  RepositoryApiErrorCode,
} from "../../../application/repository/workspaceRepositoryCatalog";
import {
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "../../../application/workspace/persistence/workspaceRepository";
import { parseRepositoryRevision } from "../../../contracts/workspace/revision";
import {
  HttpApiResponseError,
  HttpApiUnavailableError,
  requestApiJson,
} from "./apiTransport";

function mapWorkspaceApiErrorCode(
  code: string | null,
): RepositoryApiErrorCode | null {
  if (code === null) return null;
  if (code === "not_found") return "repository_not_found";
  if (
    code === "domain_validation_failed" ||
    code === "idempotency_conflict" ||
    code === "occurrence_conflict"
  ) {
    return "invalid_request";
  }
  if (code === "forbidden") return "unauthorized";
  if (code === "resource_conflict") return "revision_conflict";
  if (
    code === "adapter_unavailable" ||
    code === "insufficient_storage" ||
    code === "internal_error" ||
    code === "invalid_request" ||
    code === "repository_busy" ||
    code === "repository_corrupt" ||
    code === "repository_not_found" ||
    code === "revision_conflict" ||
    code === "unauthorized"
  ) {
    return code;
  }
  return "internal_error";
}

export function throwWorkspaceApiAdapterError(error: unknown): never {
  if (
    error instanceof WorkspaceRepositoryBackendConflictError ||
    error instanceof WorkspaceRepositoryRemoteError ||
    error instanceof WorkspaceRepositoryUnavailableError
  ) {
    throw error;
  }
  if (error instanceof HttpApiUnavailableError) {
    throw new WorkspaceRepositoryUnavailableError(error.message);
  }
  if (error instanceof HttpApiResponseError) {
    if (
      error.apiCode === "resource_conflict" &&
      typeof error.details?.currentRevision === "string"
    ) {
      throw new WorkspaceRepositoryBackendConflictError(
        parseRepositoryRevision(error.details.currentRevision),
      );
    }
    throw new WorkspaceRepositoryRemoteError(error.message, {
      code: mapWorkspaceApiErrorCode(error.apiCode),
      retryable: error.retryable,
    });
  }
  if (error instanceof VersionedRepositoryBackendConflictError) {
    throw new WorkspaceRepositoryBackendConflictError(
      parseRepositoryRevision(error.currentRevision),
    );
  }
  if (error instanceof VersionedRepositoryUnavailableError) {
    throw new WorkspaceRepositoryUnavailableError(error.message);
  }
  if (error instanceof VersionedRepositoryRemoteError) {
    throw new WorkspaceRepositoryRemoteError(error.message, {
      code: mapWorkspaceApiErrorCode(error.code),
      retryable: error.retryable,
    });
  }
  throw error;
}

export async function requestWorkspaceApiJson(
  ...args: Parameters<typeof requestApiJson>
) {
  try {
    return await requestApiJson(...args);
  } catch (error) {
    throwWorkspaceApiAdapterError(error);
  }
}

export async function withWorkspaceApiAdapterErrors<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    throwWorkspaceApiAdapterError(error);
  }
}
