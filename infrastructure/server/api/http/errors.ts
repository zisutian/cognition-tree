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
import { parseApiError } from "../../../../contracts/api/parseError.ts";
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
  VersionedContentCommitOutcomeUnknownError,
  VersionedContentRevisionConflictError,
} from "../../repository/versioned/contentStore.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  OperationAuditFinalizeError,
  OperationAuditUnavailableError,
} from "../../operations/operationLedgerContract.ts";
import { AgentServiceError } from "../../agent/errors.ts";
import {
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
} from "../../agent/configurationStore.ts";
import {
  AgentConfigurationAccessConflictError,
} from "../../agent/configurationAccess.ts";
import { AgentProviderTargetValidationError } from "../../agent/providerTargetPolicy.ts";
import { AgentProviderOperationConflictError } from "../../agent/providerOperationErrors.ts";
import {
  AgentProposalStateError,
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  AgentSessionStateError,
} from "../../../../application/agent/index.ts";
import {
  WorkspacePayloadValidationError,
} from "../../repository/workspace/layout.ts";
import {
  SystemConfigurationConflictError,
  SystemConfigurationValidationError,
  SystemMigrationConflictError,
  SystemMigrationNotFoundError,
  SystemMigrationValidationError,
} from "../../../../application/system/systemConfiguration.ts";

export const ApiErrorCatalog = {
  adapter_unavailable: { retryable: true, statusCode: 503 },
  content_commit_indeterminate: { retryable: false, statusCode: 500 },
  domain_validation_failed: { retryable: false, statusCode: 422 },
  forbidden: { retryable: false, statusCode: 403 },
  idempotency_conflict: { retryable: false, statusCode: 409 },
  insufficient_storage: { retryable: false, statusCode: 507 },
  internal_error: { retryable: false, statusCode: 500 },
  invalid_request: { retryable: false, statusCode: 400 },
  merge_conflict: { retryable: false, statusCode: 409 },
  not_found: { retryable: false, statusCode: 404 },
  occurrence_conflict: { retryable: false, statusCode: 409 },
  operation_audit_finalize_failed: { retryable: false, statusCode: 500 },
  operation_audit_unavailable: { retryable: false, statusCode: 503 },
  profile_unavailable: { retryable: true, statusCode: 503 },
  proposal_stale: { retryable: false, statusCode: 409 },
  repository_busy: { retryable: true, statusCode: 423 },
  repository_corrupt: { retryable: false, statusCode: 500 },
  resource_conflict: { retryable: false, statusCode: 409 },
  session_capacity_reached: { retryable: true, statusCode: 429 },
  session_unavailable: { retryable: false, statusCode: 409 },
  unauthorized: { retryable: false, statusCode: 401 },
} as const satisfies Record<
  ApiErrorCodeDto,
  { retryable: boolean; statusCode: number }
>;

function createConflictId(kind: string, currentVersion: string) {
  const digest = createHash("sha256")
    .update(`${kind}\u0000${currentVersion}`, "utf8")
    .digest("hex");

  return `conflict-${digest}`;
}

export class ApiRequestError extends Error {
  readonly code: ApiErrorCodeDto;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(
    code: ApiErrorCodeDto,
    message: string,
    {
      details,
      retryable = ApiErrorCatalog[code].retryable,
      statusCode = ApiErrorCatalog[code].statusCode,
    }: {
      details?: Record<string, unknown>;
      retryable?: boolean;
      statusCode?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.details = details ?? {};
    this.retryable = retryable;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): ApiErrorDto {
    return parseApiError({
      code: this.code,
      details: this.details,
      message: this.message,
      requestId,
      retryable: this.retryable,
    });
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
  if (error instanceof AgentConfigurationAccessConflictError) {
    return new ApiRequestError("resource_conflict", error.message);
  }
  if (error instanceof AgentProviderOperationConflictError) {
    return new ApiRequestError("resource_conflict", error.message);
  }
  if (error instanceof SystemConfigurationConflictError) {
    return new ApiRequestError(
      "resource_conflict",
      error.message,
      { details: { currentRevision: error.currentRevision } },
    );
  }
  if (error instanceof SystemConfigurationValidationError) {
    return new ApiRequestError("domain_validation_failed", error.message);
  }
  if (error instanceof SystemMigrationConflictError) {
    return new ApiRequestError(
      "resource_conflict",
      error.message,
      error.currentRevision
        ? { details: { currentRevision: error.currentRevision } }
        : undefined,
    );
  }
  if (error instanceof SystemMigrationNotFoundError) {
    return new ApiRequestError("not_found", error.message);
  }
  if (error instanceof SystemMigrationValidationError) {
    return new ApiRequestError("domain_validation_failed", error.message);
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
    return new ApiRequestError("idempotency_conflict", error.message, {
      details: {
        proposalId: error.proposalId,
        proposalVersion: error.proposalVersion,
      },
    });
  }
  if (error instanceof AgentOperationIndeterminateError) {
    return new ApiRequestError("idempotency_conflict", error.message, {
      details: {
        proposalId: error.proposalId,
        proposalVersion: error.proposalVersion,
      },
    });
  }
  if (error instanceof OperationAuditFinalizeError) {
    return new ApiRequestError(
      "operation_audit_finalize_failed",
      error.message,
      {
        details: {
          afterRevision: error.afterRevision,
          commitState: "committed",
        },
      },
    );
  }
  if (error instanceof OperationAuditUnavailableError) {
    return new ApiRequestError("operation_audit_unavailable", error.message, {
      details: error.operationId ? { operationId: error.operationId } : {},
    });
  }
  if (error instanceof VersionedContentCommitOutcomeUnknownError) {
    return new ApiRequestError(
      "content_commit_indeterminate",
      error.message,
      {
        details: {
          commitState: "indeterminate",
          ...(error.currentRevision
            ? { currentRevision: error.currentRevision }
            : {}),
        },
      },
    );
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
    error instanceof WorkspacePayloadValidationError
  ) {
    return new ApiRequestError("invalid_request", error.message);
  }
  if (error instanceof WireContractError) {
    return new ApiRequestError("invalid_request", error.message, {
      details: { issues: [{ path: error.path, reason: error.detail }] },
    });
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
