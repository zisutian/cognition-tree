// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentOperationAuditEntrySchema,
  type AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  ApiOperationAuditEntrySchema,
  type ApiOperationAuditEntryDto,
} from "../../../contracts/api/schemas/operations.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  assertStateFields,
  requireStateRecord,
} from "../state/secureJsonPartition.ts";
import type { AgentOperationAttempt } from "../../../application/operations/operationLedgerPort.ts";

const operationLedgerFormatVersion = 2;

type AgentReceiptStatus =
  | "committed"
  | "failed"
  | "indeterminate"
  | "pending"
  | "stale";

export type AgentReceiptState = {
  attempt: AgentOperationAttempt;
  digest: `sha256:${string}`;
  entry: AgentOperationAuditEntryDto | null;
  proposalId: string;
  proposalVersion: number;
  runtimeId: string;
  status: AgentReceiptStatus;
  updatedAt: string;
};

export type OperationLedgerState = {
  agentReceipts: AgentReceiptState[];
  auditEntries: Array<{
    entry: ApiOperationAuditEntryDto;
    pending: boolean;
  }>;
  formatVersion: typeof operationLedgerFormatVersion;
};

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function parseOperationAttempt(value: unknown): AgentOperationAttempt {
  const record = requireStateRecord(value, "Agent operation attempt");

  assertStateFields(record, [
    "approvingOwnerId",
    "beforeRevision",
    "occurredAt",
    "profileDigest",
    "profileId",
    "profileVersion",
    "providerDigest",
    "providerId",
    "providerVersion",
    "requestId",
    "route",
    "runtimeKind",
    "sessionId",
    "store",
  ], "Agent operation attempt");
  if (
    record.route !== "destructive-confirmation" &&
    record.route !== "proposal-decision"
  ) {
    throw new Error("Agent operation attempt route is invalid.");
  }
  const candidate = {
    afterRevision: null,
    approvingOwnerId: record.approvingOwnerId,
    beforeRevision: record.beforeRevision,
    changeMetadata: { blockIds: [], resourceIds: [] },
    digest: `sha256:${"0".repeat(64)}`,
    occurredAt: record.occurredAt,
    profileDigest: record.profileDigest,
    profileId: record.profileId,
    profileVersion: record.profileVersion,
    proposalId: "00000000-0000-4000-8000-000000000000",
    proposalVersion: 1,
    providerDigest: record.providerDigest,
    providerId: record.providerId,
    providerVersion: record.providerVersion,
    result: "failed",
    runtimeKind: record.runtimeKind,
    sessionId: record.sessionId,
    store: record.store,
  };
  const parsed = parseAgentSchema(AgentOperationAuditEntrySchema, candidate);

  return {
    approvingOwnerId: parsed.approvingOwnerId,
    beforeRevision: parsed.beforeRevision,
    occurredAt: parsed.occurredAt,
    profileDigest: parsed.profileDigest,
    profileId: parsed.profileId,
    profileVersion: parsed.profileVersion,
    providerDigest: parsed.providerDigest,
    providerId: parsed.providerId,
    providerVersion: parsed.providerVersion,
    requestId: requireString(
      record.requestId,
      "Agent operation attempt requestId",
    ),
    route: record.route,
    runtimeKind: parsed.runtimeKind,
    sessionId: parsed.sessionId,
    store: parsed.store,
  };
}

function parseAgentReceipt(value: unknown): AgentReceiptState {
  const record = requireStateRecord(value, "Agent operation receipt");

  assertStateFields(record, [
    "attempt",
    "digest",
    "entry",
    "proposalId",
    "proposalVersion",
    "runtimeId",
    "status",
    "updatedAt",
  ], "Agent operation receipt");
  if (
    record.status !== "committed" && record.status !== "failed" &&
    record.status !== "indeterminate" && record.status !== "pending" &&
    record.status !== "stale"
  ) {
    throw new Error("Agent operation receipt status is invalid.");
  }
  const entry = record.entry === null
    ? null
    : parseAgentSchema(AgentOperationAuditEntrySchema, record.entry);
  const digest = requireString(record.digest, "Agent operation receipt digest");

  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("Agent operation receipt digest is invalid.");
  }
  if (record.status === "pending" && entry !== null) {
    throw new Error("Pending Agent receipt cannot contain a terminal entry.");
  }
  if (
    (record.status === "committed" || record.status === "failed" ||
      record.status === "stale") && entry === null
  ) {
    throw new Error("Terminal Agent receipt must contain an entry.");
  }
  return {
    attempt: parseOperationAttempt(record.attempt),
    digest: digest as `sha256:${string}`,
    entry,
    proposalId: requireString(
      record.proposalId,
      "Agent operation receipt proposalId",
    ),
    proposalVersion: requirePositiveInteger(
      record.proposalVersion,
      "Agent operation receipt proposalVersion",
    ),
    runtimeId: requireString(
      record.runtimeId,
      "Agent operation receipt runtimeId",
    ),
    status: record.status,
    updatedAt: requireString(
      record.updatedAt,
      "Agent operation receipt updatedAt",
    ),
  };
}

export function createInitialOperationLedgerState(): OperationLedgerState {
  return {
    agentReceipts: [],
    auditEntries: [],
    formatVersion: operationLedgerFormatVersion,
  };
}

export function parseOperationLedgerState(value: unknown): OperationLedgerState {
  const record = requireStateRecord(value, "Operation ledger state");

  assertStateFields(
    record,
    ["agentReceipts", "auditEntries", "formatVersion"],
    "Operation ledger state",
  );
  if (
    record.formatVersion !== operationLedgerFormatVersion ||
    !Array.isArray(record.agentReceipts) ||
    !Array.isArray(record.auditEntries)
  ) {
    throw new Error("Operation ledger state has an invalid format.");
  }
  return {
    agentReceipts: record.agentReceipts.map(parseAgentReceipt),
    auditEntries: record.auditEntries.map((value, index) => {
      const stored = requireStateRecord(value, `auditEntries[${index}]`);

      assertStateFields(stored, ["entry", "pending"], `auditEntries[${index}]`);
      if (typeof stored.pending !== "boolean") {
        throw new Error(`auditEntries[${index}].pending must be boolean.`);
      }
      return {
        entry: parseApiSchema(ApiOperationAuditEntrySchema, stored.entry),
        pending: stored.pending,
      };
    }),
    formatVersion: operationLedgerFormatVersion,
  };
}
