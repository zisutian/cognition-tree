// SPDX-License-Identifier: GPL-3.0-or-later

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  replaceFileDurably,
} from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import {
  SecureJsonPartition,
  SecureStateCommitOutcomeUnknownError,
} from "../../../../infrastructure/server/state/secureJsonPartition.ts";

const requiresRewrite = Symbol("requiresRewrite");
const legacySecret = Symbol("legacySecret");

type TestRecord = {
  value: string;
  [legacySecret]?: string;
};

type TestState = {
  records: TestRecord[];
  revision: number;
  [requiresRewrite]?: true;
};

const roots: string[] = [];

function parseTestState(value: unknown): TestState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Test state must be an object");
  }
  const source = value as Record<string, unknown>;

  if (!Number.isSafeInteger(source.revision) || !Array.isArray(source.records)) {
    throw new Error("Test state is invalid");
  }
  const first = source.records[0];

  if (!first || typeof first !== "object" || Array.isArray(first) ||
      typeof (first as Record<string, unknown>).value !== "string") {
    throw new Error("Test record is invalid");
  }
  const record: TestRecord = {
    value: (first as Record<string, unknown>).value as string,
  };
  const state: TestState = {
    records: [record],
    revision: source.revision as number,
  };

  Object.defineProperty(record, legacySecret, {
    configurable: true,
    value: "legacy-secret",
  });
  Object.defineProperty(state, requiresRewrite, {
    configurable: true,
    value: true,
  });
  return state;
}

async function createPartition(
  replaceFile: typeof replaceFileDurably = replaceFileDurably,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-secure-partition-"));
  const directory = path.join(root, "state-v1");
  const file = path.join(directory, "state.json");

  roots.push(root);
  await mkdir(directory, { mode: 0o700 });
  await writeFile(file, '{"records":[{"value":"persisted"}],"revision":1}\n', {
    mode: 0o600,
  });
  return {
    directory,
    file,
    partition: new SecureJsonPartition<TestState>({
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
      replaceFile,
    }),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })
  ));
});

describe("Secure JSON partition", () => {
  it("securely creates a missing nested state directory chain", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ctn-secure-partition-nested-"),
    );
    const serverDirectory = path.join(root, "server");
    const directory = path.join(serverDirectory, "state-v1");

    roots.push(root);
    const partition = new SecureJsonPartition<TestState>({
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
    });

    await expect(partition.read((state) => state.revision)).resolves.toBe(0);
    expect((await stat(serverDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });

  it("refreshes disk authority while serializing multiple partition instances", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ctn-secure-partition-shared-"),
    );
    const directory = path.join(root, "state-v1");
    const createSharedPartition = () => new SecureJsonPartition<TestState>({
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
    });
    const first = createSharedPartition();
    const second = createSharedPartition();

    roots.push(root);
    await expect(first.read((state) => state.revision)).resolves.toBe(0);
    await expect(second.read((state) => state.revision)).resolves.toBe(0);
    await first.mutate((state) => {
      state.revision += 1;
      return { changed: true, result: undefined };
    });
    await second.mutate((state) => {
      state.revision += 1;
      return { changed: true, result: undefined };
    });

    await expect(first.read((state) => state.revision)).resolves.toBe(2);
  });

  it("keeps a known result but closes after state lock release fails", async () => {
    const { directory } = await createPartition();
    const releaseFailure = new Error("lock release failed");
    const partition = new SecureJsonPartition<TestState>({
      acquireLock: async () => async () => {
        throw releaseFailure;
      },
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
    });

    await expect(partition.read((state) => state.revision)).resolves.toBe(1);
    await expect(partition.read((state) => state.revision)).rejects.toMatchObject({
      cause: releaseFailure,
      name: "SecureStateLockReleaseError",
    });
  });

  it("retries initial creation only when the target is still missing", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ctn-secure-partition-create-"),
    );
    const directory = path.join(root, "state-v1");
    let failInitialCreation = true;

    roots.push(root);
    const partition = new SecureJsonPartition<TestState>({
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
      replaceFile: async (file, source, options) => {
        if (failInitialCreation) {
          failInitialCreation = false;
          throw new Error("creation failed before replacement");
        }
        await replaceFileDurably(file, source, options);
      },
    });

    await expect(partition.read((state) => state.revision)).rejects.toThrow(
      "creation failed before replacement",
    );
    await expect(partition.read((state) => state.revision)).resolves.toBe(0);
  });

  it("fails closed when initial creation became visible without confirmation", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ctn-secure-partition-create-"),
    );
    const directory = path.join(root, "state-v1");
    const durabilityFailure = new Error("creation directory sync failed");

    roots.push(root);
    const partition = new SecureJsonPartition<TestState>({
      createInitial: () => ({ records: [{ value: "initial" }], revision: 0 }),
      directory,
      fileName: "state.json",
      name: "test",
      parse: parseTestState,
      replaceFile: async (file, source, options) => {
        await replaceFileDurably(file, source, options);
        throw durabilityFailure;
      },
    });
    const failure = await partition.read((state) => state.revision).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    expect((failure as SecureStateCommitOutcomeUnknownError).cause)
      .toBe(durabilityFailure);
    let projectionInvoked = false;

    await expect(partition.read((state) => {
      projectionInvoked = true;
      return state.revision;
    })).rejects.toBe(failure);
    expect(projectionInvoked).toBe(false);
  });

  it("preserves transient symbol metadata without exposing committed references", async () => {
    const { file, partition } = await createPartition();
    let retainedCandidate: TestState | null = null;
    const returned = await partition.mutate((candidate) => {
      retainedCandidate = candidate;
      expect(candidate[requiresRewrite]).toBe(true);
      expect(candidate.records[0]?.[legacySecret]).toBe("legacy-secret");
      expect(Object.getOwnPropertyDescriptor(candidate, requiresRewrite))
        .toMatchObject({ configurable: true, enumerable: false });

      delete candidate[requiresRewrite];
      candidate.records = [{ value: "materialized" }];
      candidate.revision = 2;
      return { changed: true, result: candidate.records[0]! };
    });

    retainedCandidate!.revision = 99;
    retainedCandidate!.records[0]!.value = "retained candidate mutation";
    returned.value = "returned result mutation";
    let retainedRead: TestState | null = null;
    const projected = await partition.read((state) => {
      retainedRead = state;
      return state.records[0]!;
    });

    retainedRead!.revision = 100;
    projected.value = "projected result mutation";
    await expect(partition.read((state) => ({
      record: state.records[0],
      revision: state.revision,
    }))).resolves.toEqual({
      record: { value: "materialized" },
      revision: 2,
    });
    expect(await readFile(file, "utf8")).not.toContain("legacy-secret");
  });

  it("discards candidates when an operation throws or reports no change", async () => {
    const { file, partition } = await createPartition();
    const persisted = await readFile(file, "utf8");
    const discarded = await partition.mutate((candidate) => {
      candidate.records[0]!.value = "discarded";
      candidate.revision = 2;
      return { changed: false, result: candidate.records[0]! };
    });

    discarded.value = "discarded result mutation";
    await expect(partition.mutate((candidate) => {
      candidate.records[0]!.value = "thrown";
      candidate.revision = 3;
      throw new Error("mutation failed");
    })).rejects.toThrow("mutation failed");
    await expect(partition.read((state) => ({
      legacySecret: state.records[0]?.[legacySecret],
      requiresRewrite: state[requiresRewrite],
      revision: state.revision,
      value: state.records[0]?.value,
    }))).resolves.toEqual({
      legacySecret: "legacy-secret",
      requiresRewrite: true,
      revision: 1,
      value: "persisted",
    });
    expect(await readFile(file, "utf8")).toBe(persisted);
  });

  it("keeps the previous authority after a durable save failure", async () => {
    let failNextSave = true;
    const { partition } = await createPartition(async (file, source, options) => {
      if (failNextSave) {
        failNextSave = false;
        throw new Error("durable save failed before replacement");
      }
      await replaceFileDurably(file, source, options);
    });

    await expect(partition.read((state) => state.revision)).resolves.toBe(1);
    await expect(partition.mutate((candidate) => {
      if (candidate.revision !== 1) throw new Error("stale revision");
      candidate.records[0]!.value = "failed save";
      candidate.revision = 2;
      return { changed: true, result: candidate.revision };
    })).rejects.toThrow("durable save failed before replacement");
    await expect(partition.read((state) => ({
      revision: state.revision,
      value: state.records[0]?.value,
    }))).resolves.toEqual({ revision: 1, value: "persisted" });

    await expect(partition.mutate((candidate) => {
      if (candidate.revision !== 1) throw new Error("stale revision");
      candidate.records[0]!.value = "committed";
      candidate.revision = 2;
      return { changed: true, result: candidate.revision };
    })).resolves.toBe(2);
    await expect(partition.read((state) => ({
      revision: state.revision,
      value: state.records[0]?.value,
    }))).resolves.toEqual({ revision: 2, value: "committed" });
  });

  it("fails closed when a candidate became visible without durable confirmation", async () => {
    let failAfterReplacement = true;
    const durabilityFailure = new Error("directory sync failed after replacement");
    const { file: stateFile, partition } = await createPartition(
      async (file, source, options) => {
        await replaceFileDurably(file, source, options);
        if (failAfterReplacement) {
          failAfterReplacement = false;
          throw durabilityFailure;
        }
      },
    );

    const failure = await partition.mutate((candidate) => {
      if (candidate.revision !== 1) throw new Error("stale revision");
      candidate.records[0]!.value = "visible candidate";
      candidate.revision = 2;
      return { changed: true, result: candidate.revision };
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    expect((failure as SecureStateCommitOutcomeUnknownError).cause)
      .toBe(durabilityFailure);
    expect(JSON.parse(await readFile(stateFile, "utf8"))).toEqual({
      records: [{ value: "visible candidate" }],
      revision: 2,
    });
    await expect(partition.read((state) => state.revision)).rejects.toThrow(
      "durable write outcome could not be verified",
    );
    let operationInvoked = false;

    await expect(partition.mutate((candidate) => {
      operationInvoked = true;
      candidate.revision = 3;
      return { changed: true, result: candidate.revision };
    })).rejects.toThrow("durable write outcome could not be verified");
    expect(operationInvoked).toBe(false);
  });

  it("fails closed when a durable save outcome cannot be verified", async () => {
    const { partition } = await createPartition(async (file) => {
      await rm(file, { force: true });
      throw new Error("durable save outcome is unknown");
    });

    await expect(partition.mutate((candidate) => {
      candidate.revision = 2;
      return { changed: true, result: candidate.revision };
    })).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    await expect(partition.read((state) => state.revision)).rejects.toThrow(
      "durable write outcome could not be verified",
    );
  });
});
