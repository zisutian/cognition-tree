// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAuditEntryDto,
  ApiAuditPageDto,
} from "../../../../contracts/api/types.ts";
import {
  parseApiAuditPage,
} from "../../../../contracts/api/parse.ts";
import {
  ApiStatePartition,
  assertApiStateFields,
  requireApiStateRecord,
} from "./partition.ts";

const auditStateFormatVersion = 1;

type AuditState = {
  entries: ApiAuditEntryDto[];
  formatVersion: typeof auditStateFormatVersion;
};

function parseAuditState(value: unknown): AuditState {
  const record = requireApiStateRecord(value, "audit state");

  assertApiStateFields(
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
    entries: parseApiAuditPage({
      cursor: null,
      entries: record.entries,
    }).entries,
    formatVersion: auditStateFormatVersion,
  };
}

function committedCommandKey(entry: ApiAuditEntryDto) {
  return entry.result === "committed"
    ? `${entry.principalId}\u0000${entry.commandId}\u0000committed`
    : null;
}

export class ApiAuditStore {
  readonly #partition: ApiStatePartition<AuditState>;

  constructor(directory: string) {
    this.#partition = new ApiStatePartition({
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

  append(entry: ApiAuditEntryDto, deduplicateCommit = false): Promise<void> {
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
  }): Promise<ApiAuditPageDto> {
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
