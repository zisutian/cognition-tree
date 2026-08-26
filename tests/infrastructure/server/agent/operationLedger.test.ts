// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentOperationAuditEntryDto } from "../../../../contracts/agent/schemas.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
  OperationLedger,
} from "../../../../infrastructure/server/operations/operationLedger.ts";

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
      expect((await ledger.list({ cursor: 0, limit: 10 })).entries.map(({ proposalId }) => proposalId))
        .toEqual([entry(3).proposalId, entry(2).proposalId]);
      await ledger.updateMaximumEntries(1);
      expect((await ledger.list({ cursor: 0, limit: 10 })).entries.map(({ proposalId }) => proposalId))
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
