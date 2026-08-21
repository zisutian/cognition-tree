// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentAbsoluteTtlMilliseconds,
  agentIdleTtlMilliseconds,
  loadAgentProfileCatalog,
} from "../../../../infrastructure/server/agent/profiles.ts";

function openAiProfile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    apiKeyEnv: "TEST_AGENT_KEY",
    baseUrl: "https://runtime.example/v1",
    contextWindowTokens: 8_192,
    id,
    kind: "openai-chat",
    label: id,
    maxOutputTokens: 1_024,
    maxResidentSessions: 2,
    maxToolSteps: 8,
    model: "test-model",
    timeoutMilliseconds: 30_000,
    ...overrides,
  };
}

async function withProfileFile(
  value: unknown,
  run: (filePath: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-profiles-"));
  const filePath = path.join(directory, "profiles.json");

  try {
    await writeFile(filePath, JSON.stringify(value), { mode: 0o600 });
    await run(filePath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function profileFile(profiles: unknown[]) {
  return {
    absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
    formatVersion: 1,
    idleTtlMilliseconds: agentIdleTtlMilliseconds,
    maxAuditEntries: 100,
    profiles,
  };
}

describe("Agent profile catalog", () => {
  it("keeps the documented profile example aligned with the strict decoder", async () => {
    const catalog = await loadAgentProfileCatalog(
      path.resolve("docs/agent-profiles.example.json"),
      {
        CTN_CODEX_API_KEY: "codex-secret",
        CTN_OPENAI_CHAT_API_KEY: "chat-secret",
      },
    );

    expect(catalog.configurationProblem).toBeNull();
    expect(catalog.maxAuditEntries).toBe(1_000);
    expect(catalog.profiles.map(({ availability, kind }) => ({
      availability,
      kind,
    }))).toEqual([
      { availability: "available", kind: "codex" },
      { availability: "available", kind: "openai-chat" },
    ]);
  });

  it("isolates an invalid profile without disabling valid profiles", async () => {
    await withProfileFile(profileFile([
      openAiProfile("valid"),
      openAiProfile("invalid", {
        baseUrl: "https://user:password@runtime.example/v1?unsafe=true",
      }),
    ]), async (filePath) => {
      const catalog = await loadAgentProfileCatalog(filePath, {
        TEST_AGENT_KEY: "secret",
      });

      expect(catalog.configurationProblem).toBeNull();
      expect(catalog.profiles.map(({ availability, id }) => ({
        availability,
        id,
      }))).toEqual([
        { availability: "available", id: "valid" },
        { availability: "unavailable", id: "invalid" },
      ]);
      expect(catalog.profiles[1]?.unavailableReason).toContain(
        "cannot contain credentials",
      );
      expect(catalog.profiles[1]).toMatchObject({
        authenticationStatus: "unknown",
        model: null,
      });
    });
  });

  it("retains non-secret model metadata when server authentication is missing", async () => {
    await withProfileFile(profileFile([
      openAiProfile("missing-credential"),
    ]), async (filePath) => {
      const catalog = await loadAgentProfileCatalog(filePath, {});

      expect(catalog.profiles[0]).toMatchObject({
        authenticationStatus: "missing",
        availability: "unavailable",
        config: { apiKeyEnv: "TEST_AGENT_KEY", model: "test-model" },
        model: "test-model",
        unavailableReason: "Environment variable TEST_AGENT_KEY is not set",
      });
    });
  });

  it("disables every profile that shares a duplicated id", async () => {
    await withProfileFile(profileFile([
      openAiProfile("duplicate"),
      openAiProfile("duplicate", { label: "Second" }),
    ]), async (filePath) => {
      const catalog = await loadAgentProfileCatalog(filePath, {
        TEST_AGENT_KEY: "secret",
      });

      expect(catalog.profiles).toHaveLength(2);
      expect(catalog.profiles.every(({ availability }) =>
        availability === "unavailable"
      )).toBe(true);
      expect(catalog.profiles.every(({ unavailableReason }) =>
        unavailableReason === "Profile id is duplicated"
      )).toBe(true);
    });
  });

  it("fails the catalog closed when global limits are not exact", async () => {
    await withProfileFile({
      ...profileFile([openAiProfile("valid")]),
      idleTtlMilliseconds: 1,
    }, async (filePath) => {
      const catalog = await loadAgentProfileCatalog(filePath, {
        TEST_AGENT_KEY: "secret",
      });

      expect(catalog.configurationProblem).toContain(
        "idleTtlMilliseconds must be exactly",
      );
      expect(catalog.profiles).toEqual([]);
      expect(catalog.maxAuditEntries).toBeNull();
    });
  });
});
