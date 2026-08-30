// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  AgentOperationAuditEntrySchema,
  type AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import type { SecureStateFileReplacer } from "../state/secureJsonPartition.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
  type AgentOperationIdentity,
  type AttachTrustedClientOperationIntentInput,
  type BeginTrustedClientOperationInput,
  type FinalizeTrustedClientOperationInput,
  OperationAuditFinalizeError,
} from "./operationLedgerContract.ts";
import type { OperationLedgerState } from "./operationLedgerState.ts";
import {
  operationLedgerKey,
  projectAgentOperationAudit,
  projectIndeterminateAgentOperationAudit,
} from "./operationLedgerProjection.ts";
import { OperationLedgerStore } from "./operationLedgerStore.ts";
import { TrustedClientOperationLedger } from "./trustedClientOperationLedger.ts";

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
  readonly #now: () => string;
  readonly #receiptRetentionMilliseconds: number;
  readonly #runtimeId: string;
  readonly #store: OperationLedgerStore;
  readonly #trusted: TrustedClientOperationLedger;

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
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#store = new OperationLedgerStore(stateDirectory, maxAuditEntries, {
      now: this.#now,
      ...(options.replaceStateFile
        ? { replaceStateFile: options.replaceStateFile }
        : {}),
    });
    this.#receiptRetentionMilliseconds = options.receiptRetentionMilliseconds ??
      defaultReceiptRetentionMilliseconds;
    this.#runtimeId = options.runtimeId ?? randomUUID();
    this.#trusted = new TrustedClientOperationLedger(this.#store);
  }

  initialize() {
    return this.#store.initialize();
  }

  status() {
    return this.#store.status();
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

  beginAuthenticatedAttempt(input: BeginTrustedClientOperationInput) {
    return this.#trusted.begin(input);
  }

  attachIntent(
    operationId: string,
    input: AttachTrustedClientOperationIntentInput,
  ) {
    return this.#trusted.attachIntent(operationId, input);
  }

  finalizeTrustedAttempt(
    operationId: string,
    input: FinalizeTrustedClientOperationInput,
  ) {
    return this.#trusted.finalize(operationId, input);
  }

  list(input: { cursor: number; limit: number }) {
    return this.#store.list(input);
  }

  updateMaximumEntries(maxAuditEntries: number) {
    return this.#store.updateMaximumEntries(maxAuditEntries);
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
    return this.#store.mutate<BeginAgentResult>((state) => {
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
          this.#store.trimAudit(state);
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
    return this.#store.mutate((state) => {
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
      this.#store.trimAudit(state);
      return { changed: true, result: undefined };
    });
  }

  #markAgentIndeterminate(identity: AgentOperationIdentity) {
    return this.#store.mutate((state) => {
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
      this.#store.trimAudit(state);
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
}
