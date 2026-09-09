// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentOperationAttempt,
  AgentOperationIdentity,
  ContentOperationIntent,
  ContentOperationOutcome,
} from "../../../application/operations/index.ts";
import type { AgentOperationAuditEntryDto } from "../../../contracts/agent/index.ts";
import type { SecureStateFileReplacer } from "../state/index.ts";
import { AgentOperationLedger } from "./agentOperationLedger.ts";
import { ContentReceiptStore } from "./contentReceiptStore.ts";
import { ContentOperationLedger } from "./contentOperationLedger.ts";
import { OperationLedgerStore } from "./operationLedgerStore.ts";

export class OperationLedger {
  readonly #agent: AgentOperationLedger;
  readonly #store: OperationLedgerStore;
  readonly #content: ContentOperationLedger;

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
    const now = options.now ?? (() => new Date().toISOString());

    const receipts = new ContentReceiptStore(
      stateDirectory,
      options.replaceStateFile,
    );
    this.#store = new OperationLedgerStore(stateDirectory, maxAuditEntries, {
      now,
      migrateContentReceipts: (legacy) => receipts.importLegacy(legacy),
      ...(options.replaceStateFile
        ? { replaceStateFile: options.replaceStateFile }
        : {}),
    });
    this.#agent = new AgentOperationLedger(this.#store, {
      now,
      ...(options.receiptRetentionMilliseconds === undefined
        ? {}
        : {
            receiptRetentionMilliseconds: options.receiptRetentionMilliseconds,
          }),
      ...(options.runtimeId === undefined
        ? {}
        : { runtimeId: options.runtimeId }),
    });
    this.#content = new ContentOperationLedger(this.#store, receipts, now);
  }

  initialize() {
    return this.#store.initialize();
  }

  status() {
    return this.#store.status();
  }

  getContentOperation(operationId: string) {
    return this.#content.getContentOperation(operationId);
  }

  runContentOperation(
    intent: ContentOperationIntent,
    execute: () => Promise<ContentOperationOutcome>,
  ) {
    return this.#content.runContentOperation(intent, execute);
  }

  runAgentIdempotent(
    identity: AgentOperationIdentity,
    attempt: AgentOperationAttempt,
    execute: () => Promise<AgentOperationAuditEntryDto>,
  ) {
    return this.#agent.runIdempotent(identity, attempt, execute);
  }

  list(input: { cursor: number; limit: number }) {
    return this.#store.list(input);
  }

  updateMaximumEntries(maxAuditEntries: number) {
    return this.#store.updateMaximumEntries(maxAuditEntries);
  }
}
