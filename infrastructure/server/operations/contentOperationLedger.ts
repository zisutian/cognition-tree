// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ContentOperationIdempotencyError,
  type ContentOperationIntent,
  type ContentOperationLedgerPort,
  type ContentOperationOutcome,
  type ContentOperationResult,
} from "../../../application/operations/index.ts";
import type { OperationLedgerStore } from "./operationLedgerStore.ts";

/** Receipt retention is independent of the user-visible audit retention setting. */
export class ContentOperationLedger implements ContentOperationLedgerPort {
  readonly #inFlight = new Map<
    string,
    { digest: string; promise: Promise<ContentOperationResult> }
  >();
  readonly #undurableResults = new Map<string, ContentOperationResult>();

  private readonly store: OperationLedgerStore;
  private readonly now: () => string;
  constructor(store: OperationLedgerStore, now: () => string) {
    this.store = store;
    this.now = now;
  }

  async getContentOperation(
    operationId: string,
  ): Promise<ContentOperationResult | null> {
    const known = this.#undurableResults.get(operationId);
    if (known) return structuredClone(known);
    return this.store.read((state) =>
      structuredClone(
        state.contentReceipts.find(
          (entry) => entry.operationId === operationId,
        ) ?? null,
      ),
    );
  }

  async runContentOperation(
    intent: ContentOperationIntent,
    execute: () => Promise<ContentOperationOutcome>,
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
    execute: () => Promise<ContentOperationOutcome>,
  ): Promise<ContentOperationResult> {
    const known = this.#undurableResults.get(intent.operationId);
    if (known) {
      if (known.digest !== intent.digest)
        throw new ContentOperationIdempotencyError();
      return known;
    }
    const existing = await this.store.mutate((state) => {
      const previous = state.contentReceipts.find(
        ({ operationId }) => operationId === intent.operationId,
      );
      if (previous) {
        if (previous.digest !== intent.digest)
          throw new ContentOperationIdempotencyError();
        return { changed: false, result: structuredClone(previous) };
      }
      state.contentReceipts.push({
        ...intent,
        afterRevision: null,
        audit: "pending",
        changeMetadata: { blockIds: [], resourceIds: [] },
        error: null,
        review: null,
        status: "pending",
        updatedAt: intent.occurredAt,
      });
      return { changed: true, result: null };
    });
    if (existing) return existing;

    let outcome: ContentOperationOutcome;
    try {
      outcome = await execute();
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
      audit: "recorded",
      updatedAt: this.now(),
    };
    try {
      await this.store.mutate((state) => {
        const index = state.contentReceipts.findIndex(
          ({ operationId }) => operationId === intent.operationId,
        );
        if (index < 0)
          throw new Error("Persisted operation intent is missing.");
        state.contentReceipts[index] = result;
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
      return result;
    } catch {
      const undurable: ContentOperationResult = { ...result, audit: "failed" };
      this.#undurableResults.set(intent.operationId, undurable);
      return undurable;
    }
  }
}
