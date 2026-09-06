// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type AttachTrustedClientOperationIntentInput,
  type BeginTrustedClientOperationInput,
  type FinalizeTrustedClientOperationInput,
  OperationAuditFinalizeError,
} from "../../../application/operations/operationLedgerPort.ts";
import { createTrustedClientAuditEntry } from "./operationLedgerProjection.ts";
import type { OperationLedgerStore } from "./operationLedgerStore.ts";

export class TrustedClientOperationLedger {
  readonly #store: OperationLedgerStore;

  constructor(store: OperationLedgerStore) {
    this.#store = store;
  }

  begin(input: BeginTrustedClientOperationInput) {
    return this.#store.mutate((state) => {
      if (state.auditEntries.some(({ entry }) => entry.id === input.requestId)) {
        throw new Error(
          "Operation requestId is already present in the audit ledger",
        );
      }
      const entry = createTrustedClientAuditEntry(input);

      state.auditEntries.push({ entry, pending: true });
      this.#store.trimAudit(state);
      return { changed: true, result: input.requestId };
    });
  }

  attachIntent(
    operationId: string,
    input: AttachTrustedClientOperationIntentInput,
  ) {
    return this.#store.mutate((state) => {
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

  async finalize(
    operationId: string,
    input: FinalizeTrustedClientOperationInput,
  ) {
    try {
      await this.#store.mutate((state) => {
        const stored = state.auditEntries.find(({ entry }) =>
          entry.id === operationId
        );

        if (
          !stored || !stored.pending || stored.entry.source !== "trusted-client"
        ) {
          throw new Error("Pending trusted-client operation is unavailable");
        }
        stored.entry.afterRevision = input.afterRevision;
        stored.entry.changeMetadata = input.changeMetadata;
        stored.entry.result = input.result;
        stored.entry.updatedAt = input.updatedAt;
        stored.pending = false;
        this.#store.trimAudit(state);
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
}
