// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseRepositoryRevision } from "../../../../../contracts/workspace/revision.ts";
import {
  isLocalTransactionId,
  parseLocalTransactionManifest,
  serializeLocalTransactionManifest,
  type LocalTransactionManifest,
} from "../../../../../infrastructure/server/adapters/local/workingTreeTransactionManifest.ts";
import {
  localManagedContentHash,
  planLocalWorkingTreeTransaction,
} from "../../../../../infrastructure/server/adapters/local/workingTreeTransactionPlanner.ts";
import { RepositoryCorruptError } from "../../../../../infrastructure/server/repository/store.ts";

const baseRevision = parseRepositoryRevision(`sha256:${"0".repeat(64)}`);
const targetRevision = parseRepositoryRevision(`sha256:${"1".repeat(64)}`);

function createManifest(): LocalTransactionManifest {
  return {
    backupDirectories: ["archive"],
    baseRevision,
    operations: [{
      backupFile: "backup/000000",
      baseHash: localManagedContentHash("before"),
      path: "note.ctn",
      stagedFile: "staged/000000",
      targetHash: localManagedContentHash("after"),
    }],
    schemaVersion: 1,
    targetDirectories: ["notes"],
    targetRevision,
  };
}

describe("Local working-tree transaction modules", () => {
  it("plans deterministic payload names from sorted managed paths", () => {
    const result = planLocalWorkingTreeTransaction(
      {
        directories: new Set(["zeta", "alpha"]),
        files: new Map([
          ["zeta.ctn", "removed"],
          ["same.ctn", "same"],
          ["alpha.ctn", "before"],
        ]),
      },
      new Map([
        ["new.ctn", "created"],
        ["same.ctn", "same"],
        ["alpha.ctn", "after"],
      ]),
    );

    expect(result.backupDirectories).toEqual(["alpha", "zeta"]);
    expect(result.operations.map((operation) => ({
      backupFile: operation.backupFile,
      path: operation.path,
      stagedFile: operation.stagedFile,
    }))).toEqual([
      {
        backupFile: "backup/000000",
        path: "alpha.ctn",
        stagedFile: "staged/000000",
      },
      {
        backupFile: null,
        path: "new.ctn",
        stagedFile: "staged/000001",
      },
      {
        backupFile: "backup/000002",
        path: "zeta.ctn",
        stagedFile: null,
      },
    ]);
  });

  it("round-trips the exact manifest contract", () => {
    const manifest = createManifest();
    const source = serializeLocalTransactionManifest(manifest);

    expect(source.endsWith("\n")).toBe(true);
    expect(parseLocalTransactionManifest(JSON.parse(source))).toEqual(manifest);
  });

  it("rejects duplicate and unsafe manifest paths", () => {
    const manifest = createManifest();

    expect(() => parseLocalTransactionManifest({
      ...manifest,
      operations: [manifest.operations[0], manifest.operations[0]],
    })).toThrow(RepositoryCorruptError);
    expect(() => parseLocalTransactionManifest({
      ...manifest,
      operations: [{ ...manifest.operations[0], path: "../outside" }],
    })).toThrow(RepositoryCorruptError);
  });

  it("accepts only canonical transaction directory identifiers", () => {
    expect(isLocalTransactionId("00000000-0000-4000-8000-000000000001"))
      .toBe(true);
    expect(isLocalTransactionId("../00000000-0000-4000-8000-000000000001"))
      .toBe(false);
  });
});
