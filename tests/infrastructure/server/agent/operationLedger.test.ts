// SPDX-License-Identifier: GPL-3.0-or-later

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentOperationAuditEntryDto,
} from "../../../../contracts/agent/schemas.ts";
import {
  AgentOperationIdempotencyError,
  AgentOperationLedger,
} from "../../../../infrastructure/server/agent/operationLedger.ts";

function revision(character: string) {
  return `sha256:${character.repeat(64)}` as `sha256:${string}`;
}

function entry(index: number): AgentOperationAuditEntryDto {
  const suffix = String(index).padStart(12, "0");

  return {
    afterRevision: revision(String(index + 1).slice(-1)),
    approvingOwnerId: "local-owner",
    beforeRevision: revision(String(index).slice(-1)),
    changeMetadata: {
      blockIds: [`block-${index}`],
      resourceIds: [`resource-${index}`],
    },
    digest: revision("a"),
    occurredAt: `2026-08-20T00:00:0${index}.000Z`,
    profileDigest: revision("b"),
    profileId: "profile",
    profileVersion: 1,
    proposalId: `00000000-0000-4000-8000-${suffix}`,
    proposalVersion: 1,
    result: "committed",
    providerDigest: revision("c"),
    providerId: "provider",
    providerVersion: 1,
    runtimeKind: "openai-chat",
    sessionId: "00000000-0000-4000-8000-000000000999",
    store: { domain: "journal" },
  };
}

describe("Agent operation ledger", () => {
  it("owns idempotency, trims audit entries, and never reads agent-v1", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-ledger-"));

    try {
      const legacyDirectory = path.join(directory, "agent-v1");

      await mkdir(legacyDirectory, { mode: 0o700 });
      await writeFile(
        path.join(legacyDirectory, "state.json"),
        "{ this is intentionally invalid legacy state",
        { mode: 0o600 },
      );
      const ledger = new AgentOperationLedger(directory, 2);
      const execute = vi.fn(async () => entry(1));
      const identity = {
        digest: revision("a"),
        proposalId: entry(1).proposalId,
        proposalVersion: 1,
      };
      const [first, concurrent] = await Promise.all([
        ledger.runIdempotent(identity, execute),
        ledger.runIdempotent(identity, execute),
      ]);

      expect(execute).toHaveBeenCalledOnce();
      expect([first.replayed, concurrent.replayed].sort()).toEqual([
        false,
        true,
      ]);
      await expect(ledger.runIdempotent({
        ...identity,
        digest: revision("b"),
      }, execute)).rejects.toBeInstanceOf(AgentOperationIdempotencyError);

      for (const index of [2, 3]) {
        const next = entry(index);

        await ledger.runIdempotent({
          digest: next.digest as `sha256:${string}`,
          proposalId: next.proposalId,
          proposalVersion: next.proposalVersion,
        }, async () => next);
      }
      const page = await ledger.list({ cursor: 0, limit: 10 });

      expect(page.entries.map(({ proposalId }) => proposalId)).toEqual([
        entry(3).proposalId,
        entry(2).proposalId,
      ]);
      const persisted = await readFile(
        path.join(directory, "agent-v2", "operations.json"),
        "utf8",
      );

      expect(persisted).not.toContain("prompt");
      expect(persisted).not.toContain("tool output");
      expect(persisted).not.toContain("diff");
      expect(await readFile(
        path.join(legacyDirectory, "state.json"),
        "utf8",
      )).toContain("intentionally invalid legacy state");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
