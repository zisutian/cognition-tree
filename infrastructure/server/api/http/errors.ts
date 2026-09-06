// SPDX-License-Identifier: GPL-3.0-or-later

import { ApiRequestError } from '../protocol/index.ts';
import { createHash } from "node:crypto";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../../../contracts/common/index.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/index.ts";
import {
  TodoOccurrenceConflictError,
  TodoContentValidationError,
} from "../../../../core/todo/index.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../../core/errors/index.ts";
import {
  PortableNameValidationError,
} from "../../../../core/naming/index.ts";
import {
  DomainResourceConflictError,
} from "../../../../application/commands/index.ts";
import {
  JournalContentValidationError,
} from "../../../../core/journal/index.ts";

import {
  RepositoryCatalogError,
  RepositoryAdapterError,
  WorkspacePayloadValidationError,
} from "../../repository/index.ts";

import { WorkspaceRevisionConflictError } from "../../../../application/workspace/index.ts";
import { VersionedContentCommitOutcomeUnknownError, VersionedContentRevisionConflictError } from "../../../../application/persistence/index.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  OperationAuditFinalizeError,
  OperationAuditUnavailableError,
} from "../../../../application/operations/index.ts";
import {
  AgentProposalCommitIndeterminateError,
  AgentServiceError,
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
  AgentConfigurationAccessConflictError,
  AgentProviderOperationConflictError,
} from "../../../../application/agentHost/index.ts";


import { AgentProviderTargetValidationError } from "../../agent/index.ts";

import {
  AgentProposalStateError,
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  AgentSessionStateError,
} from "../../../../application/agent/index.ts";

import { SystemConfigurationConflictError, SystemConfigurationValidationError, SystemMigrationConflictError, SystemMigrationNotFoundError, SystemMigrationValidationError } from "../../../../application/system/index.ts";

function createConflictId(kind: string, currentVersion: string) {
  const digest = createHash("sha256")
    .update(`${kind}\u0000${currentVersion}`, "utf8")
    .digest("hex");

  return `conflict-${digest}`;
}

export function mapApiError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (error instanceof AgentProposalCommitIndeterminateError) {
    return mapApiError(error.cause);
  }
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
