// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ContentOperationIdempotencyError,
  type ContentOperationIntent,
  type ContentOperationPreparation,
  type ContentOperationRecorder,
  type ContentOperationLedgerPort,
  type ContentOperationOutcome,
  type ContentOperationResult,
} from "../../../application/operations/index.ts";
import type { ContentReceiptStore } from "./contentReceiptStore.ts";
import type { OperationLedgerStore } from "./operationLedgerStore.ts";

/** Receipt retention is independent of the user-visible audit retention setting. */
export class ContentOperationLedger implements ContentOperationLedgerPort {
  readonly #inFlight = new Map<
    string,
    { digest: string; promise: Promise<ContentOperationResult> }
  >();
  readonly #undurableResults = new Map<string, ContentOperationResult>();

  private readonly store: OperationLedgerStore;
  private readonly receipts: ContentReceiptStore;
  private readonly now: () => string;
  constructor(
    store: OperationLedgerStore,
    receipts: ContentReceiptStore,
    now: () => string,
  ) {
    this.store = store;
    this.receipts = receipts;
    this.now = now;
  }

  async getContentOperation(
    operationId: string,
  ): Promise<ContentOperationResult | null> {
    const known = this.#undurableResults.get(operationId);
    if (known) return structuredClone(known);
    const receipt = await this.receipts.read(operationId);
    const completing = this.#inFlight.get(operationId);
    if (receipt && receipt.status !== "pending" && completing)
      return structuredClone(await completing.promise);
    return receipt ? this.#project(receipt) : null;
  }

  #project(receipt: ContentOperationResult): ContentOperationResult {
    if (
      receipt.status === "pending" &&
      !this.#inFlight.has(receipt.operationId)
    )
      return {
        ...receipt,
        status: "indeterminate",
        audit: "failed",
        error: {
          code: "operation_indeterminate",
          message:
            "The process ended before a durable result was recorded. Inspect this operation and its affected content; it will not be replayed.",
        },
      };
    return receipt.audit === "pending" && receipt.status !== "pending"
      ? { ...receipt, audit: "failed" }
      : receipt;
  }

  async runContentOperation(
    intent: ContentOperationIntent,
    execute: (
      recordPrepared: ContentOperationRecorder,
    ) => Promise<ContentOperationOutcome>,
  ): Promise<ContentOperationResult> {
    const pending = this.#inFlight.get(intent.operationId);
    if (pending) {
      if (pending.digest !== intent.digest)
        throw new ContentOperationIdempotencyError();
      return structuredClone(await pending.promise);
    }
    const promise = this.#run(intent, execute);
    this.#inFlight.set(intent.operationId, { digest: intent.digest, promise });
    try {
      return structuredClone(await promise);
    } finally {
      this.#inFlight.delete(intent.operationId);
    }
  }

  async #run(
    intent: ContentOperationIntent,
    execute: (
      recordPrepared: ContentOperationRecorder,
    ) => Promise<ContentOperationOutcome>,
  ): Promise<ContentOperationResult> {
    const known = this.#undurableResults.get(intent.operationId);
    if (known) {
      if (known.digest !== intent.digest)
        throw new ContentOperationIdempotencyError();
      return known;
    }
    const existing = await this.receipts.mutate(intent.operationId, (state) => {
      const previous = state.receipt;
      if (previous) {
        if (previous.digest !== intent.digest)
          throw new ContentOperationIdempotencyError();
        // An existing persisted intent is never replayed, including across processes.
        return {
          changed: false,
          result:
            previous.status === "pending"
              ? {
                  ...previous,
                  status: "indeterminate" as const,
                  audit: "failed" as const,
                  error: {
                    code: "operation_indeterminate",
                    message:
                      "The process ended before a durable result was recorded. Inspect this operation and its affected content; it will not be replayed.",
                  },
                }
              : this.#project(previous),
        };
      }
      state.receipt = {
        ...intent,
        preparation: null,
        afterRevision: null,
        audit: "pending",
        changeMetadata: { blockIds: [], resourceIds: [] },
        error: null,
        review: null,
        status: "pending",
        updatedAt: intent.occurredAt,
      };
      return { changed: true, result: null };
    });
    if (existing) return existing;

    let preparation: ContentOperationPreparation | null = null;
    let outcome: ContentOperationOutcome;
    try {
      outcome = await execute(async (prepared) => {
        await this.receipts.mutate(intent.operationId, (state) => {
          if (
            !state.receipt ||
            state.receipt.status !== "pending" ||
            state.receipt.preparation
          )
            throw new Error(
              "Operation preparation can only be persisted once before commit.",
            );
          state.receipt.preparation = prepared;
          return { changed: true, result: undefined };
        });
        preparation = prepared;
      });
    } catch {
      // The coordinator classifies proven pre-commit failures. An unexpected
      // failure here cannot prove that the content was left unchanged.
      outcome = {
        afterRevision: null,
        changeMetadata: { blockIds: [], resourceIds: [] },
        error: {
          code: "operation_indeterminate",
          message:
            "The outcome cannot be proved. Query this operation and inspect the affected content; do not replay it.",
        },
        review: null,
        status: "indeterminate",
      };
    }
    const result: ContentOperationResult = {
      ...intent,
      ...outcome,
      preparation,
      audit: "pending",
      updatedAt: this.now(),
    };
    try {
      await this.receipts.mutate(intent.operationId, (state) => {
        state.receipt = result;
        return { changed: true, result: undefined };
      });
      await this.store.mutate((state) => {
        state.auditEntries.push({
          pending: false,
          entry: {
            afterRevision: result.afterRevision,
            beforeRevision: result.baseRevision,
            changeMetadata: result.changeMetadata,
            id: `content-${result.operationId}`,
            occurredAt: result.occurredAt,
            principalId: "local-owner",
            requestId: result.operationId,
            route: result.command,
            source: "content-api",
            store: result.scope,
            updatedAt: result.updatedAt,
            intentDigest: result.digest,
            result: result.status,
          },
        });
        this.store.trimAudit(state);
        return { changed: true, result: undefined };
      });
      result.audit = "recorded";
      await this.receipts.mutate(intent.operationId, (state) => {
        state.receipt = result;
        return { changed: true, result: undefined };
      });
      return result;
    } catch {
      const undurable: ContentOperationResult = { ...result, audit: "failed" };
      this.#undurableResults.set(intent.operationId, undurable);
      return undurable;
    }
  }
}
