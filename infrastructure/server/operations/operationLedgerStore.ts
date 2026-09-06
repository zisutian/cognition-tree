// SPDX-License-Identifier: GPL-3.0-or-later

import { lstat, unlink } from "node:fs/promises";
import path from "node:path";
import type { ApiOperationAuditPageDto } from "../../../contracts/api/index.ts";
import { SecureJsonPartition, type SecureStateFileReplacer } from "../state/index.ts";
import { SecureStatePartitionError } from "../../../application/persistence/index.ts";
import {
  type OperationAuditStatus,
  OperationAuditUnavailableError,
} from "../../../application/operations/index.ts";
import {
  createInitialOperationLedgerState,
  type OperationLedgerState,
  parseOperationLedgerState,
} from "./operationLedgerState.ts";

export class OperationLedgerStore {
  #maxAuditEntries: number;
  readonly #now: () => string;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #partition: SecureJsonPartition<OperationLedgerState>;
  readonly #stateDirectory: string;
  #unavailableMessage: string | null = null;

  constructor(
    stateDirectory: string,
    maxAuditEntries: number,
    options: {
      now: () => string;
      replaceStateFile?: SecureStateFileReplacer;
    },
  ) {
    if (!Number.isSafeInteger(maxAuditEntries) || maxAuditEntries < 1) {
      throw new Error("maxAuditEntries must be a positive integer");
    }
    this.#maxAuditEntries = maxAuditEntries;
    this.#now = options.now;
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

  list(
    { cursor, limit }: { cursor: number; limit: number },
  ): Promise<ApiOperationAuditPageDto> {
    return this.read((state) => {
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
      return Promise.reject(
        new Error("maxAuditEntries must be a positive integer"),
      );
    }
    return this.#enqueue(async () => {
      await this.#mutatePartition((state) => ({
        changed: this.trimAudit(state, maxAuditEntries),
        result: undefined,
      }));
      this.#maxAuditEntries = maxAuditEntries;
    });
  }

  trimAudit(
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

  read<Result>(project: (state: OperationLedgerState) => Result) {
    return this.#enqueue(() => this.#readPartition(project));
  }

  mutate<Result>(
    operation: (
      state: OperationLedgerState,
    ) => { changed: boolean; result: Result } | Promise<{
      changed: boolean;
      result: Result;
    }>,
  ) {
    return this.#enqueue(() => this.#mutatePartition(operation));
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
      throw new Error(
        `Legacy audit directory ${directoryName} is not a regular directory`,
      );
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
      throw new Error(
        `Legacy audit file ${directoryName}/${fileName} is not a regular file`,
      );
    }
    await unlink(target);
  }
}
