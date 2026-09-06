// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentOperationAuditEntryDto } from "../../../contracts/agent/schemas.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  ApiOperationAuditEntrySchema,
  type ApiOperationAuditEntryDto,
} from "../../../contracts/api/schemas/operations.ts";
import type {
  AgentOperationAttempt,
  AgentOperationIdentity,
  BeginTrustedClientOperationInput,
} from "../../../application/operations/operationLedgerPort.ts";

type AgentReceiptProjectionInput = Readonly<{
  attempt: AgentOperationAttempt;
  digest: `sha256:${string}`;
  proposalId: string;
  proposalVersion: number;
  updatedAt: string;
}>;

export function operationLedgerKey(
  identity: Pick<
    AgentOperationIdentity,
    "proposalId" | "proposalVersion"
  >,
) {
  return `${identity.proposalId}\u0000${identity.proposalVersion}`;
}

export function createTrustedClientAuditEntry(
  input: BeginTrustedClientOperationInput,
): ApiOperationAuditEntryDto {
  return parseApiSchema(ApiOperationAuditEntrySchema, {
    afterRevision: null,
    beforeRevision: null,
    changeMetadata: { blockIds: [], resourceIds: [] },
    id: input.requestId,
    intentDigest: null,
    occurredAt: input.occurredAt,
    principalId: input.principalId,
    requestId: input.requestId,
    result: "indeterminate",
    route: input.route,
    source: "trusted-client",
    store: input.store,
    updatedAt: input.occurredAt,
  });
}

export function projectAgentOperationAudit(
  receipt: AgentReceiptProjectionInput,
  entry: AgentOperationAuditEntryDto,
): ApiOperationAuditEntryDto {
  return parseApiSchema(ApiOperationAuditEntrySchema, {
    afterRevision: entry.afterRevision,
    agent: {
      digest: entry.digest,
      profileDigest: entry.profileDigest,
      profileId: entry.profileId,
      profileVersion: entry.profileVersion,
      proposalId: entry.proposalId,
      proposalVersion: entry.proposalVersion,
      providerDigest: entry.providerDigest,
      providerId: entry.providerId,
      providerVersion: entry.providerVersion,
      runtimeKind: entry.runtimeKind,
      sessionId: entry.sessionId,
    },
    beforeRevision: entry.beforeRevision,
    changeMetadata: entry.changeMetadata,
    id: operationLedgerKey(receipt),
    occurredAt: receipt.attempt.occurredAt,
    principalId: receipt.attempt.approvingOwnerId,
    requestId: receipt.attempt.requestId,
    result: entry.result,
    route: receipt.attempt.route,
    source: "agent",
    store: entry.store,
    updatedAt: receipt.updatedAt,
  });
}

export function projectIndeterminateAgentOperationAudit(
  receipt: AgentReceiptProjectionInput,
): ApiOperationAuditEntryDto {
  return parseApiSchema(ApiOperationAuditEntrySchema, {
    afterRevision: null,
    agent: {
      digest: receipt.digest,
      profileDigest: receipt.attempt.profileDigest,
      profileId: receipt.attempt.profileId,
      profileVersion: receipt.attempt.profileVersion,
      proposalId: receipt.proposalId,
      proposalVersion: receipt.proposalVersion,
      providerDigest: receipt.attempt.providerDigest,
      providerId: receipt.attempt.providerId,
      providerVersion: receipt.attempt.providerVersion,
      runtimeKind: receipt.attempt.runtimeKind,
      sessionId: receipt.attempt.sessionId,
    },
    beforeRevision: receipt.attempt.beforeRevision,
    changeMetadata: { blockIds: [], resourceIds: [] },
    id: operationLedgerKey(receipt),
    occurredAt: receipt.attempt.occurredAt,
    principalId: receipt.attempt.approvingOwnerId,
    requestId: receipt.attempt.requestId,
    result: "indeterminate",
    route: receipt.attempt.route,
    source: "agent",
    store: receipt.attempt.store,
    updatedAt: receipt.updatedAt,
  });
}
