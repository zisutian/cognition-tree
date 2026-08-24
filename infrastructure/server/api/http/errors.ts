// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../../../contracts/common/contractValue.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import type {
  ApiErrorCodeDto,
  ApiErrorDto,
} from "../../../../contracts/api/types.ts";
import {
  TodoOccurrenceConflictError,
} from "../../../../core/todo/recurrence/todoOccurrenceConflict.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../../core/errors/domainErrors.ts";
import {
  PortableNameValidationError,
} from "../../../../core/naming/portableName.ts";
import {
  DomainResourceConflictError,
} from "../../../../application/commands/domainCommand.ts";
import {
  JournalContentValidationError,
} from "../../../../core/journal/model/journalErrors.ts";
import {
  TodoContentValidationError,
} from "../../../../core/todo/model/todoErrors.ts";
import {
  RepositoryCatalogError,
} from "../../repository/catalog.ts";
import {
  RepositoryAdapterError,
  WorkspaceRevisionConflictError,
} from "../../repository/store.ts";
import {
  VersionedContentRevisionConflictError,
} from "../../repository/versioned/contentStore.ts";
import { AgentOperationIdempotencyError } from "../../agent/operationLedger.ts";
import { AgentServiceError } from "../../agent/errors.ts";
import {
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
} from "../../agent/configurationStore.ts";
import { AgentProviderTargetValidationError } from "../../agent/providerTargetPolicy.ts";
import {
  AgentProposalStateError,
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  AgentSessionStateError,
} from "../../../../application/agent/index.ts";
import {
  WorkspacePayloadValidationError,
} from "../../repository/workspace/layout.ts";

const statusByCode: Record<ApiErrorCodeDto, number> = {
  adapter_unavailable: 503,
  domain_validation_failed: 422,
  forbidden: 403,
  idempotency_conflict: 409,
  insufficient_storage: 507,
  internal_error: 500,
  invalid_request: 400,
  not_found: 404,
  occurrence_conflict: 409,
  profile_unavailable: 503,
  proposal_stale: 409,
  repository_busy: 423,
  repository_corrupt: 500,
  resource_conflict: 409,
  session_capacity_reached: 429,
  session_unavailable: 409,
  unauthorized: 401,
};

function createConflictId(kind: string, currentVersion: string) {
  const digest = createHash("sha256")
    .update(`${kind}\u0000${currentVersion}`, "utf8")
    .digest("hex");

  return `conflict-${digest}`;
}

export class ApiRequestError extends Error {
  readonly code: ApiErrorCodeDto;
  readonly details?: Record<string, unknown>;
  readonly statusCode: number;

  constructor(
    code: ApiErrorCodeDto,
    message: string,
    {
      details,
      statusCode = statusByCode[code],
    }: {
      details?: Record<string, unknown>;
      statusCode?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): ApiErrorDto {
    return {
      code: this.code,
      ...(this.details ? { details: this.details } : {}),
      message: this.message,
      requestId,
    };
  }
}

export function apiNotFound(message = "Resource does not exist"): never {
  throw new ApiRequestError("not_found", message);
}

export function mapApiError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (error instanceof AgentConfigurationConflictError) {
    return new ApiRequestError(
      "resource_conflict",
      error.message,
      { details: { currentRevision: error.currentRevision } },
    );
  }
  if (
    error instanceof AgentConfigurationValidationError ||
    error instanceof AgentProviderTargetValidationError
  ) {
    return new ApiRequestError("domain_validation_failed", error.message);
  }
  if (error instanceof AgentServiceError) {
    return new ApiRequestError(error.code, error.message);
  }
  if (error instanceof AgentScopeUnavailableError) {
    return new ApiRequestError("session_unavailable", error.message);
  }
  if (error instanceof AgentScopeViolationError) {
    return new ApiRequestError("forbidden", error.message);
  }
  if (
    error instanceof AgentProposalStateError ||
    error instanceof AgentSessionStateError
  ) {
    return new ApiRequestError("invalid_request", error.message);
  }
  if (error instanceof DomainNotFoundError) {
    return new ApiRequestError("not_found", error.message);
  }
  if (
    error instanceof DomainValidationError ||
    error instanceof PortableNameValidationError
  ) {
    return new ApiRequestError("domain_validation_failed", error.message);
  }
  if (error instanceof DomainResourceConflictError) {
    return new ApiRequestError(
      "resource_conflict",
      "Resource changed after it was read",
      {
        details: {
          conflictId: createConflictId(
            error.resourceId,
            error.currentVersion,
          ),
          currentVersion: error.currentVersion,
          resourceId: error.resourceId,
        },
      },
    );
  }
  if (error instanceof AgentOperationIdempotencyError) {
    return new ApiRequestError("idempotency_conflict", error.message);
  }
  if (error instanceof TodoOccurrenceConflictError) {
    return new ApiRequestError(
      "occurrence_conflict",
      "Todo recurrence occurrence is no longer current",
      {
        details: {
          currentOccurrenceDate: error.currentOccurrenceDate,
        },
      },
    );
  }
  if (
    error instanceof VersionedContentRevisionConflictError ||
    error instanceof WorkspaceRevisionConflictError
  ) {
    return new ApiRequestError(
      "resource_conflict",
      "Content changed while committing the command",
      {
        details: {
          conflictId: createConflictId("revision", error.currentRevision),
          currentRevision: error.currentRevision,
        },
      },
    );
  }
  if (error instanceof RepositoryCatalogError) {
    if (error.code === "repository_not_found") {
      return new ApiRequestError("not_found", error.message);
    }
    if (
      error.code === "adapter_unavailable" ||
      error.code === "repository_busy" ||
      error.code === "repository_corrupt" ||
      error.code === "insufficient_storage"
    ) {
      return new ApiRequestError(error.code, error.message);
    }
    return new ApiRequestError("invalid_request", error.message);
  }
  if (error instanceof RepositoryAdapterError) {
    const code = error.code === "repository_not_found"
      ? "not_found"
      : error.code === "unsupported_repository_version"
        ? "repository_corrupt"
        : error.code === "revision_conflict"
          ? "resource_conflict"
          : error.code;

    return new ApiRequestError(code, error.message);
  }
  if (
    error instanceof WorkspaceRepositoryContractError ||
    error instanceof WireContractError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    return new ApiRequestError("invalid_request", error.message);
  }
  if (
    error instanceof JournalContentValidationError ||
    error instanceof TodoContentValidationError
  ) {
    return new ApiRequestError("domain_validation_failed", error.message);
  }
  if (
    error instanceof UnsupportedRepositoryVersionError ||
    error instanceof UnsupportedWireVersionError
  ) {
    return new ApiRequestError(
      "domain_validation_failed",
      "Stored content version is not supported",
    );
  }
  if (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOSPC" || error.code === "EDQUOT")
  ) {
    return new ApiRequestError(
      "insufficient_storage",
      "Repository storage is full",
    );
  }
  return new ApiRequestError("internal_error", "Internal server error");
}
