// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  AgentOperationAuditEntrySchema,
  type AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  ApiOperationAuditEntrySchema,
  type ApiOperationAuditEntryDto,
  type ApiOperationAuditPageDto,
} from "../../../contracts/api/schemas/operations.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
  SecureStatePartitionError,
  type SecureStateFileReplacer,
} from "../state/secureJsonPartition.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
  type AgentOperationIdentity,
  OperationAuditFinalizeError,
  type OperationAuditStatus,
  OperationAuditUnavailableError,
  type TrustedClientOperationResult,
  type TrustedClientOperationStore,
} from "./operationLedgerContract.ts";

const formatVersion = 2;
const defaultReceiptRetentionMilliseconds = 24 * 60 * 60 * 1_000;

type AgentReceiptStatus =
  | "committed"
  | "failed"
  | "indeterminate"
  | "pending"
  | "stale";

type AgentReceiptState = {
  attempt: AgentOperationAttempt;
  digest: `sha256:${string}`;
  entry: AgentOperationAuditEntryDto | null;
  proposalId: string;
  proposalVersion: number;
  runtimeId: string;
  status: AgentReceiptStatus;
  updatedAt: string;
};

type OperationState = {
  agentReceipts: AgentReceiptState[];
  auditEntries: Array<{
    entry: ApiOperationAuditEntryDto;
    pending: boolean;
  }>;
  formatVersion: typeof formatVersion;
};

type BeginAgentResult =
  | { kind: "execute" }
  | { kind: "indeterminate" }
  | { entry: AgentOperationAuditEntryDto; kind: "replay" };

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

function parseAttempt(value: unknown): AgentOperationAttempt {
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
    requestId: requireString(record.requestId, "Agent operation attempt requestId"),
    route: record.route,
    runtimeKind: parsed.runtimeKind,
    sessionId: parsed.sessionId,
    store: parsed.store,
  };
}

function parseReceipt(value: unknown): AgentReceiptState {
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
    attempt: parseAttempt(record.attempt),
    digest: digest as `sha256:${string}`,
    entry,
    proposalId: requireString(record.proposalId, "Agent operation receipt proposalId"),
    proposalVersion: requirePositiveInteger(
      record.proposalVersion,
      "Agent operation receipt proposalVersion",
    ),
    runtimeId: requireString(record.runtimeId, "Agent operation receipt runtimeId"),
    status: record.status,
    updatedAt: requireString(record.updatedAt, "Agent operation receipt updatedAt"),
  };
}

function parseOperationState(value: unknown): OperationState {
  const record = requireStateRecord(value, "Operation ledger state");

  assertStateFields(
    record,
    ["agentReceipts", "auditEntries", "formatVersion"],
    "Operation ledger state",
  );
  if (
    record.formatVersion !== formatVersion ||
    !Array.isArray(record.agentReceipts) ||
    !Array.isArray(record.auditEntries)
  ) {
    throw new Error("Operation ledger state has an invalid format.");
  }
  return {
    agentReceipts: record.agentReceipts.map(parseReceipt),
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
    formatVersion,
  };
}

function operationKey(identity: Pick<
  AgentOperationIdentity,
  "proposalId" | "proposalVersion"
>) {
  return `${identity.proposalId}\u0000${identity.proposalVersion}`;
}

export class OperationLedger {
  readonly #inFlight = new Map<string, {
    digest: string;
    promise: Promise<{ entry: AgentOperationAuditEntryDto; replayed: boolean }>;
  }>();
  #maxAuditEntries: number;
  readonly #now: () => string;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #partition: SecureJsonPartition<OperationState>;
  readonly #receiptRetentionMilliseconds: number;
  readonly #runtimeId: string;
  readonly #stateDirectory: string;
  #unavailableMessage: string | null = null;

  constructor(
    stateDirectory: string,
    maxAuditEntries: number,
    options: {
      now?: () => string;
      receiptRetentionMilliseconds?: number;
      replaceStateFile?: SecureStateFileReplacer;
      runtimeId?: string;
    } = {},
  ) {
    if (!Number.isSafeInteger(maxAuditEntries) || maxAuditEntries < 1) {
      throw new Error("maxAuditEntries must be a positive integer");
    }
    this.#maxAuditEntries = maxAuditEntries;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#receiptRetentionMilliseconds = options.receiptRetentionMilliseconds ??
      defaultReceiptRetentionMilliseconds;
    this.#runtimeId = options.runtimeId ?? randomUUID();
    this.#stateDirectory = path.resolve(stateDirectory);
    this.#partition = new SecureJsonPartition({
      createInitial: () => ({
        agentReceipts: [],
        auditEntries: [],
        formatVersion,
      }),
      directory: path.join(this.#stateDirectory, "operations-v1"),
      fileName: "operations.json",
      name: "operation ledger",
      parse: parseOperationState,
      ...(options.replaceStateFile
        ? { replaceFile: options.replaceStateFile }
        : {}),
    });
  }

  initialize(): Promise<OperationAuditStatus> {
    return this.#enqueue(async () => {
      if (this.#unavailableMessage) return this.#currentStatus();
      try {
        await this.#partition.mutate((state) => {
          let changed = false;

          for (const stored of state.auditEntries) {
            if (!stored.pending) continue;
            stored.pending = false;
            stored.entry.result = "indeterminate";
            stored.entry.updatedAt = this.#now();
            changed = true;
          }
          return { changed, result: undefined };
        });
        await this.#removeLegacyAuditFile("agent-v2", "operations.json");
        await this.#removeLegacyAuditFile("api-v1", "audit.json");
        return { status: "available" };
      } catch (error) {
        this.#markUnavailable(error);
        return this.#currentStatus();
      }
    });
  }

  status(): Promise<OperationAuditStatus> {
    return this.#enqueue(async () => {
      if (this.#unavailableMessage) return this.#currentStatus();
      try {
        await this.#partition.read(() => undefined);
        return { status: "available" };
      } catch (error) {
        this.#markUnavailable(error);
        return this.#currentStatus();
      }
    });
  }

  runAgentIdempotent(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
    execute: () => Promise<AgentOperationAuditEntryDto>,
  ) {
    const key = operationKey(identity);
    const active = this.#inFlight.get(key);

    if (active) {
      if (active.digest !== identity.digest) {
        return Promise.reject(new AgentOperationIdempotencyError(identity));
      }
      return active.promise.then(({ entry }) => ({ entry, replayed: true }));
    }
    const promise = this.#runAgent(identity, attempt, execute);

    this.#inFlight.set(key, { digest: identity.digest, promise });
    void promise.finally(() => {
      if (this.#inFlight.get(key)?.promise === promise) this.#inFlight.delete(key);
    }).catch(() => undefined);
    return promise;
  }

  beginAuthenticatedAttempt(input: {
    occurredAt: string;
    principalId: string;
    requestId: string;
    route: string;
    store: TrustedClientOperationStore;
  }) {
    return this.#mutate((state) => {
      if (state.auditEntries.some(({ entry }) => entry.id === input.requestId)) {
        throw new Error("Operation requestId is already present in the audit ledger");
      }
      const entry = parseApiSchema(ApiOperationAuditEntrySchema, {
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

      state.auditEntries.push({ entry, pending: true });
      this.#trimAudit(state);
      return { changed: true, result: input.requestId };
    });
  }

  attachIntent(
    operationId: string,
    input: {
      beforeRevision: `sha256:${string}`;
      intentDigest: `sha256:${string}`;
      updatedAt: string;
    },
  ) {
    return this.#mutate((state) => {
      const stored = state.auditEntries.find(({ entry }) =>
        entry.id === operationId
      );

      if (!stored || !stored.pending || stored.entry.source !== "trusted-client") {
        throw new Error("Pending trusted-client operation is unavailable");
      }
      stored.entry.beforeRevision = input.beforeRevision;
      stored.entry.intentDigest = input.intentDigest;
      stored.entry.updatedAt = input.updatedAt;
      return { changed: true, result: undefined };
    });
  }

  async finalizeTrustedAttempt(
    operationId: string,
    input: {
      afterRevision: `sha256:${string}` | null;
      changeMetadata: { blockIds: string[]; resourceIds: string[] };
      result: TrustedClientOperationResult;
      updatedAt: string;
    },
  ) {
    try {
      await this.#mutate((state) => {
        const stored = state.auditEntries.find(({ entry }) =>
          entry.id === operationId
        );

        if (!stored || !stored.pending || stored.entry.source !== "trusted-client") {
          throw new Error("Pending trusted-client operation is unavailable");
        }
        stored.entry.afterRevision = input.afterRevision;
        stored.entry.changeMetadata = input.changeMetadata;
        stored.entry.result = input.result;
        stored.entry.updatedAt = input.updatedAt;
        stored.pending = false;
        this.#trimAudit(state);
        return { changed: true, result: undefined };
      });
    } catch (error) {
      if (
        (input.result === "committed" || input.result === "auto-merged") &&
        input.afterRevision
      ) {
        throw new OperationAuditFinalizeError(input.afterRevision);
      }
      throw error;
    }
  }

  list({ cursor, limit }: { cursor: number; limit: number }): Promise<ApiOperationAuditPageDto> {
    return this.#read((state) => {
      const descending = state.auditEntries.map(({ entry }) => entry).reverse();
      const entries = descending.slice(cursor, cursor + limit);
      const next = cursor + entries.length;

      return {
        cursor: next < descending.length ? String(next) : null,
        entries,
      };
    });
  }

  updateMaximumEntries(maxAuditEntries: number) {
    if (!Number.isSafeInteger(maxAuditEntries) || maxAuditEntries < 1) {
      return Promise.reject(new Error("maxAuditEntries must be a positive integer"));
    }
    return this.#enqueue(async () => {
      await this.#mutatePartition((state) => ({
        changed: this.#trimAudit(state, maxAuditEntries),
        result: undefined,
      }));
      this.#maxAuditEntries = maxAuditEntries;
    });
  }

  async #runAgent(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
    execute: () => Promise<AgentOperationAuditEntryDto>,
  ) {
    const begin = await this.#beginAgent(identity, attempt);

    if (begin.kind === "replay") {
      return { entry: begin.entry, replayed: true };
    }
    let entry: AgentOperationAuditEntryDto;

    try {
      entry = parseAgentSchema(AgentOperationAuditEntrySchema, await execute());
    } catch (error) {
      await this.#markAgentIndeterminate(identity).catch(() => undefined);
      throw error;
    }
    try {
      await this.#finalizeAgent(identity, entry);
    } catch (error) {
      if (entry.result === "committed" && entry.afterRevision) {
        throw new OperationAuditFinalizeError(
          entry.afterRevision as `sha256:${string}`,
        );
      }
      throw error;
    }
    return { entry, replayed: false };
  }

  #beginAgent(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
  ): Promise<Exclude<BeginAgentResult, { kind: "indeterminate" }>> {
    return this.#mutate<BeginAgentResult>((state) => {
      const purged = this.#purgeReceipts(state);
      const key = operationKey(identity);
      const existing = state.agentReceipts.find((receipt) =>
        operationKey(receipt) === key
      );

      if (existing) {
        if (existing.digest !== identity.digest) {
          throw new AgentOperationIdempotencyError(identity);
        }
        if (existing.entry) {
          return {
            changed: purged,
            result: { entry: existing.entry, kind: "replay" as const },
          };
        }
        if (existing.status === "pending") {
          existing.status = "indeterminate";
          existing.updatedAt = this.#now();
          state.auditEntries.push({
            entry: this.#projectIndeterminateAgentAudit(existing),
            pending: false,
          });
          this.#trimAudit(state);
          return {
            changed: true,
            result: { kind: "indeterminate" as const },
          };
        }
        return {
          changed: purged,
          result: { kind: "indeterminate" as const },
        };
      }
      state.agentReceipts.push({
        attempt,
        digest: identity.digest,
        entry: null,
        proposalId: identity.proposalId,
        proposalVersion: identity.proposalVersion,
        runtimeId: this.#runtimeId,
        status: "pending",
        updatedAt: this.#now(),
      });
      return { changed: true, result: { kind: "execute" as const } };
    }).then((result) => {
      if (result.kind === "indeterminate") {
        throw new AgentOperationIndeterminateError(identity);
      }
      return result;
    });
  }

  #finalizeAgent(
    identity: AgentOperationIdentity,
    entry: AgentOperationAuditEntryDto,
  ) {
    return this.#mutate((state) => {
      const receipt = state.agentReceipts.find((candidate) =>
        operationKey(candidate) === operationKey(identity)
      );

      if (!receipt || receipt.status !== "pending") {
        throw new Error("Pending Agent operation receipt is unavailable");
      }
      receipt.entry = entry;
      receipt.status = entry.result;
      receipt.updatedAt = this.#now();
      state.auditEntries.push({
        entry: this.#projectAgentAudit(receipt, entry),
        pending: false,
      });
      this.#trimAudit(state);
      return { changed: true, result: undefined };
    });
  }

  #markAgentIndeterminate(identity: AgentOperationIdentity) {
    return this.#mutate((state) => {
      const receipt = state.agentReceipts.find((candidate) =>
        operationKey(candidate) === operationKey(identity)
      );

      if (!receipt || receipt.status !== "pending") {
        return { changed: false, result: undefined };
      }
      receipt.status = "indeterminate";
      receipt.updatedAt = this.#now();
      state.auditEntries.push({
        entry: this.#projectIndeterminateAgentAudit(receipt),
        pending: false,
      });
      this.#trimAudit(state);
      return { changed: true, result: undefined };
    });
  }

  #purgeReceipts(state: OperationState): boolean {
    const cutoff = Date.parse(this.#now()) - this.#receiptRetentionMilliseconds;
    const receiptCount = state.agentReceipts.length;

    state.agentReceipts = state.agentReceipts.filter((receipt) =>
      receipt.status === "pending" || Date.parse(receipt.updatedAt) >= cutoff
    );
    return state.agentReceipts.length !== receiptCount;
  }

  #trimAudit(
    state: OperationState,
    maxAuditEntries = this.#maxAuditEntries,
  ): boolean {
    let changed = false;

    while (state.auditEntries.length > maxAuditEntries) {
      const removable = state.auditEntries.findIndex(({ pending }) => !pending);

      if (removable < 0) return changed;
      state.auditEntries.splice(removable, 1);
      changed = true;
    }
    return changed;
  }

  #projectAgentAudit(
    receipt: AgentReceiptState,
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
      id: operationKey(receipt),
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

  #projectIndeterminateAgentAudit(
    receipt: AgentReceiptState,
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
      id: operationKey(receipt),
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

  #currentStatus(): OperationAuditStatus {
    return this.#unavailableMessage
      ? { message: this.#unavailableMessage, status: "unavailable" }
      : { status: "available" };
  }

  #enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pending = this.#operationQueue.then(operation);

    this.#operationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  #read<Result>(project: (state: OperationState) => Result) {
    return this.#enqueue(() => this.#readPartition(project));
  }

  async #readPartition<Result>(project: (state: OperationState) => Result) {
    if (this.#unavailableMessage) {
      throw new OperationAuditUnavailableError(this.#unavailableMessage);
    }
    try {
      return await this.#partition.read(project);
    } catch (error) {
      if (error instanceof SecureStatePartitionError) {
        this.#markUnavailable(error);
        throw new OperationAuditUnavailableError(
          this.#unavailableMessage ?? "Operation audit is unavailable",
        );
      }
      throw error;
    }
  }

  #mutate<Result>(
    operation: (
      state: OperationState,
    ) => { changed: boolean; result: Result } | Promise<{
      changed: boolean;
      result: Result;
    }>,
  ) {
    return this.#enqueue(() => this.#mutatePartition(operation));
  }

  async #mutatePartition<Result>(
    operation: (
      state: OperationState,
    ) => { changed: boolean; result: Result } | Promise<{
      changed: boolean;
      result: Result;
    }>,
  ) {
    if (this.#unavailableMessage) {
      throw new OperationAuditUnavailableError(this.#unavailableMessage);
    }
    try {
      return await this.#partition.mutate(operation);
    } catch (error) {
      if (error instanceof SecureStatePartitionError) {
        this.#markUnavailable(error);
        throw new OperationAuditUnavailableError(
          this.#unavailableMessage ?? "Operation audit is unavailable",
        );
      }
      throw error;
    }
  }

  #markUnavailable(error: unknown) {
    this.#unavailableMessage = error instanceof Error
      ? error.message
      : "Operation audit is unavailable";
  }

  async #removeLegacyAuditFile(directoryName: string, fileName: string) {
    const directory = path.join(this.#stateDirectory, directoryName);
    const target = path.join(directory, fileName);
    let directoryStats;

    try {
      directoryStats = await lstat(directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
      throw new Error(`Legacy audit directory ${directoryName} is not a regular directory`);
    }
    let targetStats;

    try {
      targetStats = await lstat(target);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
      throw new Error(`Legacy audit file ${directoryName}/${fileName} is not a regular file`);
    }
    await unlink(target);
  }
}
