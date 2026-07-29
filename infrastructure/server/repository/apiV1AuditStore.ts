// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1AuditEntryDto,
  ApiV1AuditPageDto,
} from "../../../contracts/api/types.ts";
import {
  parseApiV1AuditPage,
} from "../../../contracts/api/parse.ts";
import {
  ApiV1StatePartition,
  assertApiV1StateFields,
  requireApiV1StateRecord,
} from "./apiV1StatePartition.ts";

const auditStateFormatVersion = 1;

type AuditState = {
  entries: ApiV1AuditEntryDto[];
  formatVersion: typeof auditStateFormatVersion;
};

function parseAuditState(value: unknown): AuditState {
  const record = requireApiV1StateRecord(value, "audit state");

  assertApiV1StateFields(
    record,
    ["entries", "formatVersion"],
    "audit state",
  );
  if (
    record.formatVersion !== auditStateFormatVersion ||
    !Array.isArray(record.entries)
  ) {
    throw new Error("audit state has an invalid format.");
  }
  return {
    entries: parseApiV1AuditPage({
      cursor: null,
      entries: record.entries,
    }).entries,
    formatVersion: auditStateFormatVersion,
  };
}

function committedCommandKey(entry: ApiV1AuditEntryDto) {
  return entry.result === "committed"
    ? `${entry.principalId}\u0000${entry.commandId}\u0000committed`
    : null;
}

export class ApiV1AuditStore {
  readonly #partition: ApiV1StatePartition<AuditState>;

  constructor(directory: string) {
    this.#partition = new ApiV1StatePartition({
      createInitial: () => ({
        entries: [],
        formatVersion: auditStateFormatVersion,
      }),
      directory,
      fileName: "audit.json",
      name: "audit",
      parse: parseAuditState,
    });
  }

  append(entry: ApiV1AuditEntryDto, deduplicateCommit = false): Promise<void> {
    return this.#partition.mutate((state) => {
      const key = deduplicateCommit ? committedCommandKey(entry) : null;

      if (
        key !== null &&
        state.entries.some((candidate) => committedCommandKey(candidate) === key)
      ) {
        return { changed: false, result: undefined };
      }
      state.entries.push(entry);
      return { changed: true, result: undefined };
    });
  }

  list({
    cursor,
    limit,
  }: {
    cursor: number;
    limit: number;
  }): Promise<ApiV1AuditPageDto> {
    return this.#partition.read((state) => {
      const entries = state.entries
        .slice()
        .reverse()
        .slice(cursor, cursor + limit);
      const next = cursor + entries.length;

      return {
        cursor: next < state.entries.length ? String(next) : null,
        entries,
      };
    });
  }
}
