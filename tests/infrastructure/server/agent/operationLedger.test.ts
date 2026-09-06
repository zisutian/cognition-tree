// SPDX-License-Identifier: GPL-3.0-or-later

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentOperationAuditEntryDto } from "../../../../contracts/agent/schemas.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
} from "../../../../infrastructure/server/operations/operationLedgerContract.ts";
import { OperationLedger } from "../../../../infrastructure/server/operations/operationLedger.ts";
import {
  replaceFileDurably,
} from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";

function revision(character: string) {
  return `sha256:${character.repeat(64)}` as `sha256:${string}`;
}

function entry(index: number): AgentOperationAuditEntryDto {
  const suffix = String(index).padStart(12, "0");

  return {
    afterRevision: revision(String(index + 1).slice(-1)),
    approvingOwnerId: "local-owner",
    beforeRevision: revision(String(index).slice(-1)),
    changeMetadata: { blockIds: [`block-${index}`], resourceIds: [`resource-${index}`] },
    digest: revision("a"),
    occurredAt: `2026-08-20T00:00:0${index}.000Z`,
    profileDigest: revision("b"),
    profileId: "profile",
    profileVersion: 1,
    proposalId: `00000000-0000-4000-8000-${suffix}`,
    proposalVersion: 1,
    providerDigest: revision("c"),
    providerId: "provider",
    providerVersion: 1,
    result: "committed",
    runtimeKind: "openai-chat",
    sessionId: "00000000-0000-4000-8000-000000000999",
    store: { domain: "journal" },
  };
}

function attempt(value: AgentOperationAuditEntryDto): AgentOperationAttempt {
  return {
    approvingOwnerId: value.approvingOwnerId,
    beforeRevision: value.beforeRevision,
    occurredAt: value.occurredAt,
    profileDigest: value.profileDigest,
    profileId: value.profileId,
    profileVersion: value.profileVersion,
    providerDigest: value.providerDigest,
    providerId: value.providerId,
    providerVersion: value.providerVersion,
    requestId: `request-${value.proposalId}`,
    route: "proposal-decision",
    runtimeKind: value.runtimeKind,
    sessionId: value.sessionId,
    store: value.store,
  };
}

function identity(value: AgentOperationAuditEntryDto) {
  return {
    digest: value.digest as `sha256:${string}`,
    proposalId: value.proposalId,
    proposalVersion: value.proposalVersion,
  };
}

describe("operation ledger", () => {
  it("removes only the two exact legacy audit files during initialization", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-cleanup-"));

    try {
      for (const relative of [
        "agent-v2/operations.json",
        "api-v1/audit.json",
        "api-v1/tokens.json",
      ]) {
        const file = path.join(directory, relative);

        await mkdir(path.dirname(file), { mode: 0o700, recursive: true });
        await writeFile(file, relative, { mode: 0o600 });
      }
      const ledger = new OperationLedger(directory, 10);

      await expect(ledger.initialize()).resolves.toEqual({ status: "available" });
      await expect(access(path.join(directory, "agent-v2/operations.json")))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(path.join(directory, "api-v1/audit.json")))
        .rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(path.join(directory, "api-v1/tokens.json"), "utf8"))
        .toBe("api-v1/tokens.json");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed instead of following a legacy audit symlink", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-symlink-"));

    try {
      const protectedFile = path.join(directory, "protected.json");
      const legacyDirectory = path.join(directory, "agent-v2");

      await writeFile(protectedFile, "keep", { mode: 0o600 });
      await mkdir(legacyDirectory, { mode: 0o700 });
      await symlink(protectedFile, path.join(legacyDirectory, "operations.json"));
      const status = await new OperationLedger(directory, 10).initialize();

      expect(status).toMatchObject({ status: "unavailable" });
      expect(await readFile(protectedFile, "utf8")).toBe("keep");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps Agent idempotency receipts outside the trimmed audit view", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-ledger-"));

    try {
      const legacyDirectory = path.join(directory, "agent-v1");

      await mkdir(legacyDirectory, { mode: 0o700 });
      await writeFile(path.join(legacyDirectory, "state.json"), "{ invalid legacy state", { mode: 0o600 });
      const ledger = new OperationLedger(directory, 2, {
        now: () => "2026-08-20T00:00:09.000Z",
        runtimeId: "runtime-one",
      });
      const firstEntry = entry(1);
      const execute = vi.fn(async () => firstEntry);
      const [first, concurrent] = await Promise.all([
        ledger.runAgentIdempotent(identity(firstEntry), attempt(firstEntry), execute),
        ledger.runAgentIdempotent(identity(firstEntry), attempt(firstEntry), execute),
      ]);

      expect(execute).toHaveBeenCalledOnce();
      expect([first.replayed, concurrent.replayed].sort()).toEqual([false, true]);
      await expect(ledger.runAgentIdempotent({
        ...identity(firstEntry),
        digest: revision("b"),
      }, attempt(firstEntry), execute)).rejects.toBeInstanceOf(AgentOperationIdempotencyError);

      for (const index of [2, 3]) {
        const next = entry(index);

        await ledger.runAgentIdempotent(identity(next), attempt(next), async () => next);
      }
      expect((await ledger.list({ cursor: 0, limit: 10 })).entries.map((item) =>
        item.source === "agent" ? item.agent.proposalId : ""
      ))
        .toEqual([entry(3).proposalId, entry(2).proposalId]);
      await ledger.updateMaximumEntries(1);
      expect((await ledger.list({ cursor: 0, limit: 10 })).entries.map((item) =>
        item.source === "agent" ? item.agent.proposalId : ""
      ))
        .toEqual([entry(3).proposalId]);
      const replay = await ledger.runAgentIdempotent(identity(firstEntry), attempt(firstEntry), execute);

      expect(replay).toMatchObject({ replayed: true });
      expect(execute).toHaveBeenCalledOnce();
      const persisted = await readFile(path.join(directory, "operations-v1", "operations.json"), "utf8");

      expect(persisted).not.toContain("prompt");
      expect(persisted).not.toContain("tool output");
      expect(persisted).not.toContain("diff");
      expect(persisted).toContain('"agentReceipts"');
      expect(await readFile(path.join(legacyDirectory, "state.json"), "utf8"))
        .toContain("invalid legacy state");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("persists expired receipt cleanup when the current operation is replayed", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-replay-purge-"));

    try {
      let now = "2026-08-20T00:00:00.000Z";
      const ledger = new OperationLedger(directory, 1, {
        now: () => now,
        receiptRetentionMilliseconds: 1_000,
        runtimeId: "runtime-one",
      });
      const expired = entry(1);
      const replayed = entry(2);

      await ledger.runAgentIdempotent(
        identity(expired),
        attempt(expired),
        async () => expired,
      );
      now = "2026-08-20T00:00:00.500Z";
      await ledger.runAgentIdempotent(
        identity(replayed),
        attempt(replayed),
        async () => replayed,
      );
      now = "2026-08-20T00:00:01.200Z";
      const executeReplay = vi.fn(async () => replayed);

      await expect(ledger.runAgentIdempotent(
        identity(replayed),
        attempt(replayed),
        executeReplay,
      )).resolves.toMatchObject({ replayed: true });
      expect(executeReplay).not.toHaveBeenCalled();
      const persisted = JSON.parse(await readFile(
        path.join(directory, "operations-v1", "operations.json"),
        "utf8",
      )) as { agentReceipts: Array<{ proposalId: string }> };

      expect(persisted.agentReceipts.map(({ proposalId }) => proposalId))
        .toEqual([replayed.proposalId]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps the runtime audit limit until the durable trim succeeds", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-operation-limit-failure-"),
    );

    try {
      let failNextSave = false;
      let markTrimSaveStarted!: () => void;
      let rejectTrimSave!: (reason: unknown) => void;
      const trimSaveStarted = new Promise<void>((resolve) => {
        markTrimSaveStarted = resolve;
      });
      const trimSaveFailure = new Promise<never>((_resolve, reject) => {
        rejectTrimSave = reject;
      });
      const ledger = new OperationLedger(directory, 2, {
        replaceStateFile: async (file, source, options) => {
          if (failNextSave) {
            failNextSave = false;
            markTrimSaveStarted();
            await trimSaveFailure;
          }
          await replaceFileDurably(file, source, options);
        },
      });

      for (const index of [1, 2]) {
        const value = entry(index);

        await ledger.runAgentIdempotent(
          identity(value),
          attempt(value),
          async () => value,
        );
      }
      failNextSave = true;
      const updating = ledger.updateMaximumEntries(1);

      await trimSaveStarted;
      const queuedAttempt = ledger.beginAuthenticatedAttempt({
        occurredAt: "2026-08-20T00:00:00.000Z",
        principalId: "trusted-client",
        requestId: "new-operation",
        route: "/api/v4/content/workspace",
        store: { domain: "journal" },
      });

      rejectTrimSave(new Error("durable trim failed"));
      await expect(updating).rejects.toThrow("durable trim failed");
      await expect(queuedAttempt).resolves.toBe("new-operation");
      const persisted = JSON.parse(await readFile(
        path.join(directory, "operations-v1", "operations.json"),
        "utf8",
      )) as {
        auditEntries: Array<{ entry: { id: string }; pending: boolean }>;
      };

      expect(persisted.auditEntries).toHaveLength(2);
      expect(persisted.auditEntries.filter(({ pending }) => pending))
        .toEqual([{
          entry: expect.objectContaining({ id: "new-operation" }),
          pending: true,
        }]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("publishes a durable audit limit before the next ledger operation", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-operation-limit-order-"),
    );

    try {
      let holdNextSave = false;
      let markTrimSaveStarted!: () => void;
      let releaseTrimSave!: () => void;
      const trimSaveStarted = new Promise<void>((resolve) => {
        markTrimSaveStarted = resolve;
      });
      const trimSaveGate = new Promise<void>((resolve) => {
        releaseTrimSave = resolve;
      });
      const ledger = new OperationLedger(directory, 2, {
        replaceStateFile: async (file, source, options) => {
          if (holdNextSave) {
            holdNextSave = false;
            markTrimSaveStarted();
            await trimSaveGate;
          }
          await replaceFileDurably(file, source, options);
        },
      });

      for (const index of [1, 2]) {
        const value = entry(index);

        await ledger.runAgentIdempotent(
          identity(value),
          attempt(value),
          async () => value,
        );
      }
      holdNextSave = true;
      const updating = ledger.updateMaximumEntries(1);

      await trimSaveStarted;
      const queuedAttempt = ledger.beginAuthenticatedAttempt({
        occurredAt: "2026-08-20T00:00:00.000Z",
        principalId: "trusted-client",
        requestId: "new-operation",
        route: "/api/v4/content/workspace",
        store: { domain: "journal" },
      });

      releaseTrimSave();
      await expect(updating).resolves.toBeUndefined();
      await expect(queuedAttempt).resolves.toBe("new-operation");
      const persisted = JSON.parse(await readFile(
        path.join(directory, "operations-v1", "operations.json"),
        "utf8",
      )) as {
        auditEntries: Array<{ entry: { id: string }; pending: boolean }>;
      };

      expect(persisted.auditEntries).toEqual([{
        entry: expect.objectContaining({ id: "new-operation" }),
        pending: true,
      }]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not turn a rejected domain mutation into ledger unavailability", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-operation-domain-error-"),
    );

    try {
      const ledger = new OperationLedger(directory, 10);
      const first = {
        occurredAt: "2026-08-20T00:00:00.000Z",
        principalId: "trusted-client",
        requestId: "duplicate-operation",
        route: "/api/v4/content/workspace",
        store: { domain: "journal" as const },
      };

      await expect(ledger.beginAuthenticatedAttempt(first)).resolves.toBe(
        first.requestId,
      );
      await expect(ledger.beginAuthenticatedAttempt(first)).rejects.toThrow(
        "requestId is already present",
      );
      await expect(ledger.beginAuthenticatedAttempt({
        ...first,
        requestId: "next-operation",
      })).resolves.toBe("next-operation");
      await expect(ledger.status()).resolves.toEqual({ status: "available" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not hold the ledger lock while an Agent content CAS is running", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-concurrent-"));

    try {
      const ledger = new OperationLedger(directory, 10);
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let markFirstStarted!: () => void;
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });
      const firstEntry = entry(1);
      const secondEntry = entry(2);
      const first = ledger.runAgentIdempotent(identity(firstEntry), attempt(firstEntry), async () => {
        markFirstStarted();
        await firstGate;
        return firstEntry;
      });

      await firstStarted;
      await expect(ledger.runAgentIdempotent(identity(secondEntry), attempt(secondEntry), async () => secondEntry))
        .resolves.toMatchObject({ replayed: false });
      releaseFirst();
      await expect(first).resolves.toMatchObject({ replayed: false });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("marks an interrupted execution indeterminate and never reruns it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-operation-pending-"));

    try {
      const ledger = new OperationLedger(directory, 10);
      const value = entry(1);
      const execute = vi.fn(async () => {
        throw new Error("process interrupted after durable begin");
      });

      await expect(ledger.runAgentIdempotent(identity(value), attempt(value), execute))
        .rejects.toThrow("process interrupted");
      await expect(ledger.runAgentIdempotent(identity(value), attempt(value), execute))
        .rejects.toBeInstanceOf(AgentOperationIndeterminateError);
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
