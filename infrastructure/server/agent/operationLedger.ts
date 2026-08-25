// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  AgentOperationAuditEntrySchema,
  type AgentOperationAuditEntryDto,
  type AgentOperationAuditPageDto,
} from "../../../contracts/agent/schemas.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
} from "../state/secureJsonPartition.ts";

const formatVersion = 2;
type OperationState = {
  entries: AgentOperationAuditEntryDto[];
  formatVersion: typeof formatVersion;
};

function parseOperationState(value: unknown): OperationState {
  const record = requireStateRecord(value, "Agent operation state");

  assertStateFields(record, ["entries", "formatVersion"], "Agent operation state");
  if (record.formatVersion !== formatVersion || !Array.isArray(record.entries)) {
    throw new Error("Agent operation state has an invalid format.");
  }
  return {
    entries: record.entries.map((entry) =>
      parseAgentSchema(AgentOperationAuditEntrySchema, entry)
    ),
    formatVersion,
  };
}

export class AgentOperationIdempotencyError extends Error {
  constructor() {
    super("Proposal id/version was already used with a different digest");
    this.name = "AgentOperationIdempotencyError";
  }
}

function operationKey(entry: Pick<
  AgentOperationAuditEntryDto,
  "proposalId" | "proposalVersion"
>) {
  return `${entry.proposalId}\u0000${entry.proposalVersion}`;
}

export class AgentOperationLedger {
  readonly #inFlight = new Map<string, {
    digest: string;
    promise: Promise<{ entry: AgentOperationAuditEntryDto; replayed: boolean }>;
  }>();
  #maxAuditEntries: number;
  readonly #partition: SecureJsonPartition<OperationState>;

  constructor(stateDirectory: string, maxAuditEntries: number) {
    if (!Number.isSafeInteger(maxAuditEntries) || maxAuditEntries < 1) {
      throw new Error("maxAuditEntries must be a positive integer");
    }
    this.#maxAuditEntries = maxAuditEntries;
    this.#partition = new SecureJsonPartition({
      createInitial: () => ({ entries: [], formatVersion }),
      directory: path.join(path.resolve(stateDirectory), "agent-v2"),
      fileName: "operations.json",
      name: "Agent operation ledger",
      parse: parseOperationState,
    });
  }

  runIdempotent(
    identity: {
      digest: `sha256:${string}`;
      proposalId: string;
      proposalVersion: number;
    },
    execute: () => Promise<AgentOperationAuditEntryDto>,
  ) {
    const key = operationKey(identity);
    const active = this.#inFlight.get(key);

    if (active) {
      if (active.digest !== identity.digest) {
        return Promise.reject(new AgentOperationIdempotencyError());
      }
      return active.promise.then(({ entry }) => ({ entry, replayed: true }));
    }
    const promise = this.#partition.mutate(async (state) => {
      const existing = state.entries.find((entry) => operationKey(entry) === key);

      if (existing) {
        if (existing.digest !== identity.digest) {
          throw new AgentOperationIdempotencyError();
        }
        return { changed: false, result: { entry: existing, replayed: true } };
      }
      const entry = parseAgentSchema(
        AgentOperationAuditEntrySchema,
        await execute(),
      );

      state.entries.push(entry);
      if (state.entries.length > this.#maxAuditEntries) {
        state.entries.splice(0, state.entries.length - this.#maxAuditEntries);
      }
      return { changed: true, result: { entry, replayed: false } };
    });

    this.#inFlight.set(key, { digest: identity.digest, promise });
    void promise.finally(() => {
      if (this.#inFlight.get(key)?.promise === promise) this.#inFlight.delete(key);
    }).catch(() => undefined);
    return promise;
  }

  list({ cursor, limit }: { cursor: number; limit: number }): Promise<AgentOperationAuditPageDto> {
    return this.#partition.read((state) => {
      const descending = [...state.entries].reverse();
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
    return this.#partition.mutate((state) => {
      this.#maxAuditEntries = maxAuditEntries;
      const removeCount = Math.max(0, state.entries.length - maxAuditEntries);

      if (removeCount === 0) return { changed: false, result: undefined };
      state.entries.splice(0, removeCount);
      return { changed: true, result: undefined };
    });
  }
}
