// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentOperationAuditEntryDto } from "../../../contracts/agent/schemas.ts";

export type AgentOperationIdentity = Readonly<{
  digest: `sha256:${string}`;
  proposalId: string;
  proposalVersion: number;
}>;

export type AgentOperationAttempt = Readonly<{
  approvingOwnerId: string;
  beforeRevision: string;
  occurredAt: string;
  profileDigest: string;
  profileId: string;
  profileVersion: number;
  providerDigest: string;
  providerId: string;
  providerVersion: number;
  requestId: string;
  route: "destructive-confirmation" | "proposal-decision";
  runtimeKind: AgentOperationAuditEntryDto["runtimeKind"];
  sessionId: string;
  store: AgentOperationAuditEntryDto["store"];
}>;

export class AgentOperationIdempotencyError extends Error {
  readonly proposalId: string;
  readonly proposalVersion: number;

  constructor(
    identity: Pick<AgentOperationIdentity, "proposalId" | "proposalVersion">,
  ) {
    super("Proposal id/version was already used with a different digest");
    this.name = "AgentOperationIdempotencyError";
    this.proposalId = identity.proposalId;
    this.proposalVersion = identity.proposalVersion;
  }
}

export class AgentOperationIndeterminateError extends Error {
  readonly proposalId: string;
  readonly proposalVersion: number;

  constructor(
    identity: Pick<AgentOperationIdentity, "proposalId" | "proposalVersion">,
  ) {
    super("A previous Agent commit attempt has an indeterminate outcome");
    this.name = "AgentOperationIndeterminateError";
    this.proposalId = identity.proposalId;
    this.proposalVersion = identity.proposalVersion;
  }
}

export class OperationAuditUnavailableError extends Error {
  readonly operationId?: string;

  constructor(message: string, operationId?: string) {
    super(message);
    this.name = "OperationAuditUnavailableError";
    this.operationId = operationId;
  }
}

export class OperationAuditFinalizeError extends Error {
  readonly afterRevision: `sha256:${string}`;

  constructor(afterRevision: `sha256:${string}`) {
    super("Content was committed but the operation audit could not be finalized");
    this.name = "OperationAuditFinalizeError";
    this.afterRevision = afterRevision;
  }
}

export type OperationAuditStatus =
  | Readonly<{ status: "available" }>
  | Readonly<{ message: string; status: "unavailable" }>;

export type TrustedClientOperationStore =
  | { domain: "journal" }
  | { domain: "todo" }
  | { domain: "workspace"; repositoryId: string };

export type TrustedClientOperationResult =
  | "auto-merged"
  | "committed"
  | "conflict"
  | "failed"
  | "unchanged";
