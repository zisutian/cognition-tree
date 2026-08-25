// SPDX-License-Identifier: GPL-3.0-or-later

import {
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
  AgentConfigurationConflictError,
  AgentConfigurationStore,
  AgentConfigurationValidationError,
} from "../../../../infrastructure/server/agent/configurationStore.ts";

const directories: string[] = [];

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-config-"));
  const ids = ["provider-1", "profile-1", "provider-2", "profile-2"];

  directories.push(directory);
  return {
    directory,
    store: new AgentConfigurationStore(directory, {
      createId: () => ids.shift() ?? "unexpected-id",
    }),
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("Agent configuration store", () => {
  it("persists secrets in a protected partition without exposing them in views", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "bearer",
      baseUrl: null,
      kind: "codex",
      label: "Codex",
      privateNetworkAccessConfirmed: false,
    });

    expect(created.provider).toMatchObject({
      authenticationStatus: "configured",
      id: "agent-provider-provider-1",
      kind: "codex",
      version: 1,
    });
    expect(JSON.stringify(created)).not.toContain("provider-secret");
    const file = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const source = await readFile(file, "utf8");
    const fileStats = await stat(file);

    expect(source).toContain("provider-secret");
    expect(JSON.parse(source)).toMatchObject({ formatVersion: 2 });
    expect(fileStats.mode & 0o777).toBe(0o600);
  });

  it("uses exact CAS and versioned provider/profile digests", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const providerResult = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "bearer",
      baseUrl: null,
      kind: "codex",
      label: "Codex",
      privateNetworkAccessConfirmed: false,
    });
    const profileResult = await store.createProfile(
      providerResult.configuration.revision,
      {
        label: "Primary Codex",
        maxResidentSessions: 2,
        model: "gpt-5-codex",
        parameters: {
          kind: "codex",
          maxInputCharacters: 100_000,
          maxOutputCharacters: 50_000,
          reasoningEffort: "high",
        },
        providerId: providerResult.provider.id,
        timeoutMilliseconds: 120_000,
      },
    );

    expect(profileResult.profile).toMatchObject({
      availability: "available",
      id: "agent-profile-profile-1",
      version: 1,
    });
    expect(profileResult.profile.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(store.updateProfile(
      providerResult.configuration.revision,
      profileResult.profile.id,
      {
        label: "Stale update",
        maxResidentSessions: 1,
        model: "gpt-5-codex",
        parameters: {
          kind: "codex",
          maxInputCharacters: 1,
          maxOutputCharacters: 1,
          reasoningEffort: "low",
        },
        providerId: providerResult.provider.id,
        timeoutMilliseconds: 1,
      },
    )).rejects.toBeInstanceOf(AgentConfigurationConflictError);
  });

  it("requires current conformance for chat profiles and invalidates it on provider changes", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const providerResult = await store.createProvider(initial.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Local Ollama",
      privateNetworkAccessConfirmed: false,
    });
    const profileResult = await store.createProfile(
      providerResult.configuration.revision,
      {
        label: "Local Qwen",
        maxResidentSessions: 1,
        model: "qwen2.5-coder:7b",
        parameters: {
          contextWindowTokens: 32_768,
          kind: "chat",
          maxOutputTokens: 4_096,
          maxToolSteps: 16,
          toolCallMode: "single-json",
        },
        providerId: providerResult.provider.id,
        timeoutMilliseconds: 600_000,
      },
    );

    expect(profileResult.profile).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Tool-call conformance has not been verified",
    });
    const conformanceResult = await store.setConformance(
      profileResult.configuration.revision,
      profileResult.profile.id,
      { checkedAt: "2026-08-25T00:00:00.000Z", toolCallMode: "single-json" },
    );

    expect(conformanceResult.profile).toMatchObject({
      availability: "available",
      unavailableReason: null,
    });
    const updatedProvider = await store.updateProvider(
      conformanceResult.configuration.revision,
      providerResult.provider.id,
      {
        authenticationType: "none",
        baseUrl: "http://127.0.0.1:11435",
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      },
    );

    expect(updatedProvider.configuration.profiles[0]).toMatchObject({
      availability: "unavailable",
      conformance: null,
    });
    await expect(store.deleteProvider(
      updatedProvider.configuration.revision,
      providerResult.provider.id,
    )).rejects.toBeInstanceOf(AgentConfigurationValidationError);
  });

  it("fails closed when the persisted state is invalid", async () => {
    const { directory, store } = await createStore();

    await store.readSnapshot();
    const file = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );

    await writeFile(file, '{"formatVersion":999}\n', { mode: 0o600 });
    const reloaded = new AgentConfigurationStore(directory);

    await expect(reloaded.readSnapshot()).rejects.toThrow(
      "Agent configuration state has unsupported or missing fields",
    );
  });

  it("atomically upgrades the pre-permission format with no private grant", async () => {
    const { directory, store } = await createStore();

    const initial = await store.readSnapshot();
    await store.createProvider(initial.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Existing Ollama",
      privateNetworkAccessConfirmed: false,
    });
    const file = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const previous = JSON.parse(await readFile(file, "utf8")) as {
      formatVersion: number;
      providers: Array<Record<string, unknown>>;
    };

    previous.formatVersion = 1;
    delete previous.providers[0]!.privateNetworkOrigin;
    await writeFile(file, `${JSON.stringify(previous)}\n`, { mode: 0o600 });
    const upgraded = await new AgentConfigurationStore(directory).readSnapshot();

    expect(upgraded.providers[0]).toMatchObject({
      label: "Existing Ollama",
      privateNetworkAccess: "not-required",
    });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
      formatVersion: 2,
      providers: [{ privateNetworkOrigin: null }],
    });
  });

  it.each([
    [{
      authenticationType: "none" as const,
      baseUrl: "http://169.254.169.254",
      kind: "ollama" as const,
    }, "outside the allowed network targets"],
    [{
      apiKey: "secret",
      authenticationType: "bearer" as const,
      baseUrl: "http://models.example.invalid/v1",
      kind: "openai-chat" as const,
    }, "Remote providers with credentials must use HTTPS"],
  ])("rejects unsafe provider endpoints", async (input, message) => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();

    await expect(store.createProvider(initial.revision, {
      ...input,
      label: "Unsafe provider",
      privateNetworkAccessConfirmed: false,
    })).rejects.toThrow(message);
  });
});
