// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentOperationAuditEntryDto } from "../../../contracts/agent/schemas.ts";
import type { SecureStateFileReplacer } from "../state/secureJsonPartition.ts";
import { AgentOperationLedger } from "./agentOperationLedger.ts";
import type {
  AgentOperationAttempt,
  AgentOperationIdentity,
  AttachTrustedClientOperationIntentInput,
  BeginTrustedClientOperationInput,
  FinalizeTrustedClientOperationInput,
} from "../../../application/operations/operationLedgerPort.ts";
import { OperationLedgerStore } from "./operationLedgerStore.ts";
import { TrustedClientOperationLedger } from "./trustedClientOperationLedger.ts";

export class OperationLedger {
  readonly #agent: AgentOperationLedger;
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
    const now = options.now ?? (() => new Date().toISOString());

    this.#store = new OperationLedgerStore(stateDirectory, maxAuditEntries, {
      now,
      ...(options.replaceStateFile
        ? { replaceStateFile: options.replaceStateFile }
        : {}),
    });
    this.#agent = new AgentOperationLedger(this.#store, {
      now,
      ...(options.receiptRetentionMilliseconds === undefined
        ? {}
        : {
            receiptRetentionMilliseconds:
              options.receiptRetentionMilliseconds,
          }),
      ...(options.runtimeId === undefined
        ? {}
        : { runtimeId: options.runtimeId }),
    });
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
    return this.#agent.runIdempotent(identity, attempt, execute);
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
}
