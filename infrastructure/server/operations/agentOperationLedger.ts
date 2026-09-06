// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  AgentOperationAuditEntrySchema,
  type AgentOperationAuditEntryDto,
  parseAgentSchema,
} from "../../../contracts/agent/index.ts";

import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
  type AgentOperationIdentity,
  OperationAuditFinalizeError,
} from "../../../application/operations/index.ts";
import {
  operationLedgerKey,
  projectAgentOperationAudit,
  projectIndeterminateAgentOperationAudit,
} from "./operationLedgerProjection.ts";
import type { OperationLedgerStore } from "./operationLedgerStore.ts";

const defaultReceiptRetentionMilliseconds = 24 * 60 * 60 * 1_000;

type BeginAgentResult =
  | { kind: "execute" }
  | { kind: "indeterminate" }
  | { entry: AgentOperationAuditEntryDto; kind: "replay" };

function retainCurrentAgentReceipts<
  Receipt extends { status: string; updatedAt: string },
>(
  receipts: readonly Receipt[],
  now: string,
  retentionMilliseconds: number,
) {
  const cutoff = Date.parse(now) - retentionMilliseconds;
  const retained = receipts.filter((receipt) =>
    receipt.status === "pending" || Date.parse(receipt.updatedAt) >= cutoff
  );

  return {
    changed: retained.length !== receipts.length,
    receipts: retained,
  };
}

export class AgentOperationLedger {
  readonly #inFlight = new Map<string, {
    digest: string;
    promise: Promise<{ entry: AgentOperationAuditEntryDto; replayed: boolean }>;
  }>();
  readonly #now: () => string;
  readonly #receiptRetentionMilliseconds: number;
  readonly #runtimeId: string;
  readonly #store: OperationLedgerStore;

  constructor(
    store: OperationLedgerStore,
    options: {
      now: () => string;
      receiptRetentionMilliseconds?: number;
      runtimeId?: string;
    },
  ) {
    this.#store = store;
    this.#now = options.now;
    this.#receiptRetentionMilliseconds = options.receiptRetentionMilliseconds ??
      defaultReceiptRetentionMilliseconds;
    this.#runtimeId = options.runtimeId ?? randomUUID();
  }

  runIdempotent(
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
    const promise = this.#run(identity, attempt, execute);

    this.#inFlight.set(key, { digest: identity.digest, promise });
    void promise.finally(() => {
      if (this.#inFlight.get(key)?.promise === promise) this.#inFlight.delete(key);
    }).catch(() => undefined);
    return promise;
  }

  async #run(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
    execute: () => Promise<AgentOperationAuditEntryDto>,
  ) {
    const begin = await this.#begin(identity, attempt);

    if (begin.kind === "replay") {
      return { entry: begin.entry, replayed: true };
    }
    let entry: AgentOperationAuditEntryDto;

    try {
      entry = parseAgentSchema(AgentOperationAuditEntrySchema, await execute());
    } catch (error) {
      await this.#markIndeterminate(identity).catch(() => undefined);
      throw error;
    }
    try {
      await this.#finalize(identity, entry);
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

  #begin(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
  ): Promise<Exclude<BeginAgentResult, { kind: "indeterminate" }>> {
    return this.#store.mutate<BeginAgentResult>((state) => {
      const retention = retainCurrentAgentReceipts(
        state.agentReceipts,
        this.#now(),
        this.#receiptRetentionMilliseconds,
      );

      state.agentReceipts = retention.receipts;
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
            changed: retention.changed,
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
          changed: retention.changed,
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

  #finalize(
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

  #markIndeterminate(identity: AgentOperationIdentity) {
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
}
