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
  type ApiOperationAuditPageDto,
} from "../../../contracts/api/schemas/operations.ts";
import {
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
import {
  createInitialOperationLedgerState,
  type OperationLedgerState,
  parseOperationLedgerState,
} from "./operationLedgerState.ts";
import {
  createTrustedClientAuditEntry,
  operationLedgerKey,
  projectAgentOperationAudit,
  projectIndeterminateAgentOperationAudit,
} from "./operationLedgerProjection.ts";

const defaultReceiptRetentionMilliseconds = 24 * 60 * 60 * 1_000;

type BeginAgentResult =
  | { kind: "execute" }
  | { kind: "indeterminate" }
  | { entry: AgentOperationAuditEntryDto; kind: "replay" };

export class OperationLedger {
  readonly #inFlight = new Map<string, {
    digest: string;
    promise: Promise<{ entry: AgentOperationAuditEntryDto; replayed: boolean }>;
  }>();
  #maxAuditEntries: number;
  readonly #now: () => string;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #partition: SecureJsonPartition<OperationLedgerState>;
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
      createInitial: createInitialOperationLedgerState,
      directory: path.join(this.#stateDirectory, "operations-v1"),
      fileName: "operations.json",
      name: "operation ledger",
      parse: parseOperationLedgerState,
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
    const key = operationLedgerKey(identity);
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
      const entry = createTrustedClientAuditEntry(input);

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
      const key = operationLedgerKey(identity);
      const existing = state.agentReceipts.find((receipt) =>
        operationLedgerKey(receipt) === key
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
            entry: projectIndeterminateAgentOperationAudit(existing),
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
        operationLedgerKey(candidate) === operationLedgerKey(identity)
      );

      if (!receipt || receipt.status !== "pending") {
        throw new Error("Pending Agent operation receipt is unavailable");
      }
      receipt.entry = entry;
      receipt.status = entry.result;
      receipt.updatedAt = this.#now();
      state.auditEntries.push({
        entry: projectAgentOperationAudit(receipt, entry),
        pending: false,
      });
      this.#trimAudit(state);
      return { changed: true, result: undefined };
    });
  }

  #markAgentIndeterminate(identity: AgentOperationIdentity) {
    return this.#mutate((state) => {
      const receipt = state.agentReceipts.find((candidate) =>
        operationLedgerKey(candidate) === operationLedgerKey(identity)
      );

      if (!receipt || receipt.status !== "pending") {
        return { changed: false, result: undefined };
      }
      receipt.status = "indeterminate";
      receipt.updatedAt = this.#now();
      state.auditEntries.push({
        entry: projectIndeterminateAgentOperationAudit(receipt),
        pending: false,
      });
      this.#trimAudit(state);
      return { changed: true, result: undefined };
    });
  }

  #purgeReceipts(state: OperationLedgerState): boolean {
    const cutoff = Date.parse(this.#now()) - this.#receiptRetentionMilliseconds;
    const receiptCount = state.agentReceipts.length;

    state.agentReceipts = state.agentReceipts.filter((receipt) =>
      receipt.status === "pending" || Date.parse(receipt.updatedAt) >= cutoff
    );
    return state.agentReceipts.length !== receiptCount;
  }

  #trimAudit(
    state: OperationLedgerState,
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

  #read<Result>(project: (state: OperationLedgerState) => Result) {
    return this.#enqueue(() => this.#readPartition(project));
  }

  async #readPartition<Result>(
    project: (state: OperationLedgerState) => Result,
  ) {
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
      state: OperationLedgerState,
    ) => { changed: boolean; result: Result } | Promise<{
      changed: boolean;
      result: Result;
    }>,
  ) {
    return this.#enqueue(() => this.#mutatePartition(operation));
  }

  async #mutatePartition<Result>(
    operation: (
      state: OperationLedgerState,
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
