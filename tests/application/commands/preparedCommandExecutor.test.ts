// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  executePreparedCommand,
  type PreparedCommandStore,
} from "../../../application/commands/preparedCommandExecutor.ts";

type Revision = `sha256:${string}`;
type Snapshot = {
  content: { value: number };
  projection: { indexedValue: number };
  revision: Revision;
};

const revision = (character: string) =>
  `sha256:${character.repeat(64)}` as Revision;
const occurredAt = "2026-08-19T00:00:00.000Z";

function prepare(snapshot: Snapshot) {
  const value = snapshot.content.value + 1;

  return {
    changes: {
      blocks: [],
      occurredAt,
      resources: [],
    },
    content: { value },
    diff: [{ from: 0, insertedText: String(value), resourceId: "resource", to: 0 }],
    projection: { indexedValue: value },
    result: { kind: "updated" as const, value },
    revision: revision(String(value).at(-1) ?? "0"),
  };
}

describe("prepared command executor", () => {
  it("returns a prepared preview without opening a commit transaction", async () => {
    const commit = vi.fn();
    const snapshot: Snapshot = {
      content: { value: 1 },
      projection: { indexedValue: 1 },
      revision: revision("a"),
    };
    const store: PreparedCommandStore<
      Snapshot["content"],
      Snapshot["projection"],
      Revision
    > = {
      commit,
      isRevisionConflict: () => false,
      load: async () => snapshot,
    };

    await expect(executePreparedCommand({
      mode: "preview",
      prepare,
      store,
    })).resolves.toEqual({
      changes: { blocks: [], occurredAt, resources: [] },
      diff: [{ from: 0, insertedText: "2", resourceId: "resource", to: 0 }],
      result: { kind: "updated", value: 2 },
      revision: revision("2"),
      status: "previewed",
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("reprepares against the latest projection after a CAS conflict", async () => {
    const conflict = new Error("conflict");
    let snapshot: Snapshot = {
      content: { value: 1 },
      projection: { indexedValue: 1 },
      revision: revision("a"),
    };
    const transactions: unknown[] = [];
    const store: PreparedCommandStore<
      Snapshot["content"],
      Snapshot["projection"],
      Revision
    > = {
      async commit(transaction) {
        transactions.push(transaction);
        if (transactions.length === 1) {
          snapshot = {
            content: { value: 10 },
            projection: { indexedValue: 10 },
            revision: revision("b"),
          };
          throw conflict;
        }
        return { revision: revision("c") };
      },
      isRevisionConflict: (error) => error === conflict,
      load: async () => snapshot,
    };

    await expect(executePreparedCommand({
      mode: "commit",
      prepare,
      store,
    })).resolves.toEqual({
      changes: { blocks: [], occurredAt, resources: [] },
      result: { kind: "updated", value: 11 },
      revision: revision("c"),
      status: "committed",
    });
    expect(transactions).toEqual([
      {
        baseRevision: revision("a"),
        content: { value: 2 },
        projection: { indexedValue: 2 },
      },
      {
        baseRevision: revision("b"),
        content: { value: 11 },
        projection: { indexedValue: 11 },
      },
    ]);
  });

  it("does not retry failures outside the store conflict policy", async () => {
    const failure = new Error("write failed");
    const commit = vi.fn(async () => {
      throw failure;
    });
    const store: PreparedCommandStore<
      Snapshot["content"],
      Snapshot["projection"],
      Revision
    > = {
      commit,
      isRevisionConflict: () => false,
      load: async () => ({
        content: { value: 1 },
        projection: { indexedValue: 1 },
        revision: revision("a"),
      }),
    };

    await expect(executePreparedCommand({
      mode: "commit",
      prepare,
      store,
    })).rejects.toBe(failure);
    expect(commit).toHaveBeenCalledOnce();
  });
});
