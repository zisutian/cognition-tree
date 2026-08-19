// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CommittedCommandResultDto,
} from "../../../../contracts/api/types.ts";
import {
  parseApiV1Schema,
} from "../../../../contracts/api/parse.ts";
import {
  ApiV1CommittedCommandResultSchema,
} from "../../../../contracts/api/schemas/transitions.ts";
import {
  createApiV1CommandRequestDigest,
} from "./crypto.ts";
import {
  ApiV1StatePartition,
  assertApiV1StateFields,
  requireApiV1StateRecord,
} from "./partition.ts";

const receiptStateFormatVersion = 1;
const receiptRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export class ApiV1IdempotencyConflictError extends Error {
  constructor() {
    super("commandId was already used with a different request");
    this.name = "ApiV1IdempotencyConflictError";
  }
}

type StoredReceipt = {
  commandId: string;
  expiresAt: string;
  principalId: string;
  requestDigest: string;
  result: ApiV1CommittedCommandResultDto;
};

type ReceiptState = {
  formatVersion: typeof receiptStateFormatVersion;
  receipts: StoredReceipt[];
};

function parseStoredReceipt(value: unknown, index: number): StoredReceipt {
  const pathLabel = `receipts[${index}]`;
  const record = requireApiV1StateRecord(value, pathLabel);

  assertApiV1StateFields(record, [
    "commandId",
    "expiresAt",
    "principalId",
    "requestDigest",
    "result",
  ], pathLabel);
  for (const key of ["commandId", "expiresAt", "principalId", "requestDigest"]) {
    if (typeof record[key] !== "string") {
      throw new Error(`${pathLabel}.${key} is invalid.`);
    }
  }
  if (
    !/^[0-9a-f]{64}$/.test(record.requestDigest as string) ||
    !Number.isFinite(Date.parse(record.expiresAt as string)) ||
    new Date(record.expiresAt as string).toISOString() !== record.expiresAt
  ) {
    throw new Error(`${pathLabel} digest or expiry is invalid.`);
  }
  return {
    commandId: record.commandId as string,
    expiresAt: record.expiresAt as string,
    principalId: record.principalId as string,
    requestDigest: record.requestDigest as string,
    result: parseApiV1Schema(
      ApiV1CommittedCommandResultSchema,
      record.result,
    ),
  };
}

function parseReceiptState(value: unknown): ReceiptState {
  const record = requireApiV1StateRecord(value, "receipt state");

  assertApiV1StateFields(
    record,
    ["formatVersion", "receipts"],
    "receipt state",
  );
  if (
    record.formatVersion !== receiptStateFormatVersion ||
    !Array.isArray(record.receipts)
  ) {
    throw new Error("receipt state has an invalid format.");
  }
  return {
    formatVersion: receiptStateFormatVersion,
    receipts: record.receipts.map(parseStoredReceipt),
  };
}

export class ApiV1ReceiptStore {
  readonly #now: () => Date;
  readonly #partition: ApiV1StatePartition<ReceiptState>;

  constructor(directory: string, now: () => Date) {
    this.#now = now;
    this.#partition = new ApiV1StatePartition({
      createInitial: () => ({
        formatVersion: receiptStateFormatVersion,
        receipts: [],
      }),
      directory,
      fileName: "receipts.json",
      name: "receipt",
      parse: parseReceiptState,
    });
  }

  read(
    principalId: string,
    commandId: string,
    request: unknown,
  ): Promise<ApiV1CommittedCommandResultDto | null> {
    return this.#partition.mutate((state) => {
      const changed = this.#purge(state);
      const receipt = state.receipts.find(
        (candidate) =>
          candidate.principalId === principalId &&
          candidate.commandId === commandId,
      );

      if (
        receipt &&
        receipt.requestDigest !== createApiV1CommandRequestDigest(request)
      ) {
        throw new ApiV1IdempotencyConflictError();
      }
      return { changed, result: receipt?.result ?? null };
    });
  }

  save(
    principalId: string,
    commandId: string,
    request: unknown,
    result: ApiV1CommittedCommandResultDto,
  ): Promise<void> {
    return this.#partition.mutate((state) => {
      const purged = this.#purge(state);
      const existing = state.receipts.find(
        (candidate) =>
          candidate.principalId === principalId &&
          candidate.commandId === commandId,
      );
      const requestDigest = createApiV1CommandRequestDigest(request);

      if (existing) {
        if (existing.requestDigest !== requestDigest) {
          throw new ApiV1IdempotencyConflictError();
        }
        return { changed: purged, result: undefined };
      }
      state.receipts.push({
        commandId,
        expiresAt: new Date(
          this.#now().getTime() + receiptRetentionMilliseconds,
        ).toISOString(),
        principalId,
        requestDigest,
        result,
      });
      return { changed: true, result: undefined };
    });
  }

  #purge(state: ReceiptState) {
    const now = this.#now().getTime();
    const previousLength = state.receipts.length;

    state.receipts = state.receipts.filter(
      ({ expiresAt }) => Date.parse(expiresAt) > now,
    );
    return previousLength !== state.receipts.length;
  }
}
