// SPDX-License-Identifier: GPL-3.0-or-later

import {
  access,
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
      authenticationType: "api-key",
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
    const credentialFile = path.join(
      directory,
      "agent-auth-v1",
      "providers",
      created.provider.id,
      "api-key-v1.json",
    );

    expect(source).not.toContain("provider-secret");
    expect(JSON.parse(source)).toMatchObject({ formatVersion: 5 });
    expect(await readFile(credentialFile, "utf8")).toContain("provider-secret");
    expect((await stat(path.dirname(credentialFile))).mode & 0o777).toBe(0o700);
    expect((await stat(credentialFile)).mode & 0o777).toBe(0o600);
    expect(fileStats.mode & 0o777).toBe(0o600);
  });

  it("moves format 4 API keys into the credential partition before switching authority", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      apiKey: "legacy-provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Legacy provider",
      privateNetworkAccessConfirmed: false,
    });
    const profile = await store.createProfile(provider.configuration.revision, {
      label: "Legacy profile",
      maxResidentSessions: 1,
      model: "legacy-model",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        reasoningEffort: "model-default",
        toolCallMode: "native",
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 60_000,
    });
    await store.setConformance(profile.configuration.revision, profile.profile.id, {
      checkedAt: "2026-08-25T00:00:00.000Z",
      toolCallMode: "native",
    });
    const configurationFile = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const legacy = JSON.parse(await readFile(configurationFile, "utf8")) as {
      formatVersion: number;
      providers: Array<{ authentication: unknown }>;
    };

    legacy.formatVersion = 4;
    legacy.providers[0]!.authentication = {
      apiKey: "legacy-provider-secret",
      type: "bearer",
    };
    await writeFile(configurationFile, `${JSON.stringify(legacy)}\n`, {
      mode: 0o600,
    });
    await rm(path.join(directory, "agent-auth-v1"), {
      force: true,
      recursive: true,
    });

    const migratedStore = new AgentConfigurationStore(directory);
    const migrated = await migratedStore.readSnapshot();
    const source = await readFile(configurationFile, "utf8");
    const credentialFile = path.join(
      directory,
      "agent-auth-v1",
      "providers",
      provider.provider.id,
      "api-key-v1.json",
    );

    expect(migrated).toMatchObject({
      profiles: [{ conformance: null }],
      providers: [{ authenticationStatus: "configured" }],
    });
    expect(source).not.toContain("legacy-provider-secret");
    expect(JSON.parse(source)).toMatchObject({
      formatVersion: 5,
      providers: [{
        authentication: {
          credential: {
            reference: `providers/${provider.provider.id}/api-key-v1.json`,
            version: 1,
          },
          type: "api-key",
        },
      }],
    });
    expect(await readFile(credentialFile, "utf8"))
      .toContain("legacy-provider-secret");
    await expect(migratedStore.resolveProvider(provider.provider.id))
      .resolves.toMatchObject({ apiKey: "legacy-provider-secret" });
  });

  it("does not switch format 4 authority when credential migration cannot be written", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      apiKey: "legacy-provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Legacy provider",
      privateNetworkAccessConfirmed: false,
    });
    const configurationFile = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const legacy = JSON.parse(await readFile(configurationFile, "utf8"));

    legacy.formatVersion = 4;
    legacy.providers[0].authentication = {
      apiKey: "legacy-provider-secret",
      type: "bearer",
    };
    const source = `${JSON.stringify(legacy)}\n`;

    await writeFile(configurationFile, source, { mode: 0o600 });
    await rm(path.join(directory, "agent-auth-v1"), {
      force: true,
      recursive: true,
    });
    await writeFile(path.join(directory, "agent-auth-v1"), "blocked", {
      mode: 0o600,
    });

    await expect(new AgentConfigurationStore(directory).readSnapshot())
      .rejects.toThrow("not a regular directory");
    expect(await readFile(configurationFile, "utf8")).toBe(source);
    expect(provider.provider.authenticationStatus).toBe("configured");
  });

  it("replaces and clears API keys without retaining superseded credential files", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      apiKey: "first-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Provider",
      privateNetworkAccessConfirmed: false,
    });
    const providerDirectory = path.join(
      directory,
      "agent-auth-v1",
      "providers",
      created.provider.id,
    );
    const replaced = await store.updateProvider(
      created.configuration.revision,
      created.provider.id,
      {
        apiKey: "second-secret",
        authenticationType: "api-key",
        baseUrl: "https://models.example.invalid/v1",
        kind: "openai-chat",
        label: "Provider",
        privateNetworkAccessConfirmed: false,
      },
    );

    await expect(readFile(path.join(providerDirectory, "api-key-v1.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(providerDirectory, "api-key-v2.json"), "utf8"))
      .toContain("second-secret");
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: "second-secret",
    });

    const cleared = await store.clearProviderAuthentication(
      replaced.configuration.revision,
      created.provider.id,
    );

    expect(cleared.providers[0]!.authenticationStatus).toBe("missing");
    await expect(readFile(path.join(providerDirectory, "api-key-v2.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: null,
    });
  });

  it("promotes and clears an application-managed Codex device login exactly", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      authenticationType: "chatgpt-device-code",
      baseUrl: null,
      kind: "codex",
      label: "ChatGPT Codex",
      privateNetworkAccessConfirmed: false,
    });
    const loginId = "00000000-0000-4000-8000-000000000001";
    const prepared = await store.prepareCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      loginId,
    );

    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    const authenticated = await store.completeCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      prepared.credentialVersion,
      loginId,
    );
    const providerDirectory = path.join(
      directory,
      "agent-auth-v1",
      "providers",
      created.provider.id,
    );

    expect(authenticated.providers[0]).toMatchObject({
      authenticationStatus: "configured",
      authenticationType: "chatgpt-device-code",
      version: 2,
    });
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: null,
      codexHome: prepared.home,
    });
    expect((await stat(prepared.home)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(prepared.home, "auth.json"))).mode & 0o777)
      .toBe(0o600);

    const cleared = await store.clearProviderAuthentication(
      authenticated.revision,
      created.provider.id,
    );

    expect(cleared.providers[0]).toMatchObject({
      authenticationStatus: "missing",
      authenticationType: "chatgpt-device-code",
      version: 3,
    });
    await expect(access(providerDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes staged Codex authentication when exact CAS becomes stale", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      authenticationType: "chatgpt-device-code",
      baseUrl: null,
      kind: "codex",
      label: "ChatGPT Codex",
      privateNetworkAccessConfirmed: false,
    });
    const loginId = "00000000-0000-4000-8000-000000000002";
    const prepared = await store.prepareCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      loginId,
    );

    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    await store.createProvider(created.configuration.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Other provider",
      privateNetworkAccessConfirmed: false,
    });
    await expect(store.completeCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      prepared.credentialVersion,
      loginId,
    )).rejects.toBeInstanceOf(AgentConfigurationConflictError);
    await expect(access(prepared.home)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      codexHome: null,
      provider: { authenticationStatus: "missing" },
    });
    expect(await readFile(
      path.join(directory, "agent-config-v1", "configuration.json"),
      "utf8",
    )).not.toContain(loginId);
  });

  it("fails closed when a credential file no longer matches its reference", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Provider",
      privateNetworkAccessConfirmed: false,
    });
    const credentialFile = path.join(
      directory,
      "agent-auth-v1",
      "providers",
      created.provider.id,
      "api-key-v1.json",
    );
    const damaged = JSON.parse(await readFile(credentialFile, "utf8"));

    damaged.apiKey = "tampered-secret";
    await writeFile(credentialFile, `${JSON.stringify(damaged)}\n`, { mode: 0o600 });

    await expect(store.resolveProvider(created.provider.id))
      .rejects.toThrow("reference verification failed");
  });

  it("rejects credential references that escape the provider partition", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Provider",
      privateNetworkAccessConfirmed: false,
    });
    const configurationFile = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const damaged = JSON.parse(await readFile(configurationFile, "utf8"));

    damaged.providers[0].authentication.credential.reference =
      "providers/../../outside.json";
    await writeFile(configurationFile, `${JSON.stringify(damaged)}\n`, {
      mode: 0o600,
    });

    await expect(new AgentConfigurationStore(directory).readSnapshot())
      .rejects.toThrow("credential reference is invalid");
  });

  it("uses exact CAS and versioned provider/profile digests", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const providerResult = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "api-key",
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
          historyBudgetCharacters: 131_072,
          kind: "chat",
          maxOutputTokens: 4_096,
          maxToolSteps: 16,
          reasoningEffort: "model-default",
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

  it("requires enough chat tool steps for syntax, staging, and proposal submission", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Local Ollama",
      privateNetworkAccessConfirmed: false,
    });
    const input = {
      label: "Local writer",
      maxResidentSessions: 1,
      model: "qwen3:27b",
      parameters: {
        historyBudgetCharacters: 131_072,
        kind: "chat" as const,
        maxOutputTokens: 4_096,
        maxToolSteps: 2,
        reasoningEffort: "model-default" as const,
        toolCallMode: "single-json" as const,
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 600_000,
    };

    await expect(store.createProfile(provider.configuration.revision, input))
      .rejects.toThrow("at least 3 tool steps");
    const created = await store.createProfile(
      provider.configuration.revision,
      {
        ...input,
        parameters: { ...input.parameters, maxToolSteps: 3 },
      },
    );
    const file = path.join(directory, "agent-config-v1", "configuration.json");
    const persisted = JSON.parse(await readFile(file, "utf8")) as {
      profiles: Array<{ parameters: { maxToolSteps: number } }>;
    };

    persisted.profiles[0]!.parameters.maxToolSteps = 2;
    await writeFile(file, `${JSON.stringify(persisted)}\n`, { mode: 0o600 });
    const reloaded = await new AgentConfigurationStore(directory).readSnapshot();

    expect(created.profile.parameters).toMatchObject({ maxToolSteps: 3 });
    expect(reloaded.profiles[0]).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Chat profiles require at least 3 tool steps",
    });
  });

  it("rejects reasoning effort that an OpenAI-compatible provider cannot apply", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "OpenAI compatible",
      privateNetworkAccessConfirmed: false,
    });

    await expect(store.createProfile(provider.configuration.revision, {
      label: "Invalid effort",
      maxResidentSessions: 1,
      model: "chat-model",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        reasoningEffort: "low",
        toolCallMode: "native",
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 60_000,
    })).rejects.toThrow(
      "Explicit chat reasoning effort is only valid for Ollama profiles",
    );
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
      formatVersion: 5,
      providers: [{ privateNetworkOrigin: null }],
    });
  });

  it("atomically migrates token estimates to character budgets and invalidates chat conformance", async () => {
    const { directory, store } = await createStore();
    let configuration = await store.readSnapshot();
    const provider = await store.createProvider(configuration.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Existing Ollama",
      privateNetworkAccessConfirmed: false,
    });

    configuration = provider.configuration;
    for (const historyBudgetCharacters of [65_536, 131_072]) {
      const created = await store.createProfile(configuration.revision, {
        label: `Budget ${historyBudgetCharacters}`,
        maxResidentSessions: 1,
        model: `model-${historyBudgetCharacters}`,
        parameters: {
          historyBudgetCharacters,
          kind: "chat",
          maxOutputTokens: 1_024,
          maxToolSteps: 8,
          reasoningEffort: "model-default",
          toolCallMode: "single-json",
        },
        providerId: provider.provider.id,
        timeoutMilliseconds: 60_000,
      });

      configuration = (await store.setConformance(
        created.configuration.revision,
        created.profile.id,
        {
          checkedAt: "2026-08-25T00:00:00.000Z",
          toolCallMode: "single-json",
        },
      )).configuration;
    }
    const file = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const legacy = JSON.parse(await readFile(file, "utf8")) as {
      formatVersion: number;
      profiles: Array<{
        parameters: Record<string, unknown>;
      }>;
    };

    legacy.formatVersion = 2;
    for (const profile of legacy.profiles) {
      profile.parameters.contextWindowTokens =
        Number(profile.parameters.historyBudgetCharacters) / 4;
      delete profile.parameters.historyBudgetCharacters;
      delete profile.parameters.reasoningEffort;
    }
    await writeFile(file, `${JSON.stringify(legacy)}\n`, { mode: 0o600 });

    const migrated = await new AgentConfigurationStore(directory).readSnapshot();
    const persisted = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;

    expect(migrated.profiles.map((profile) => ({
      budget: profile.parameters.kind === "chat"
        ? profile.parameters.historyBudgetCharacters
        : null,
      conformance: profile.conformance,
      id: profile.id,
      version: profile.version,
    }))).toEqual([
      {
        budget: 65_536,
        conformance: null,
        id: "agent-profile-profile-1",
        version: 2,
      },
      {
        budget: 131_072,
        conformance: null,
        id: "agent-profile-provider-2",
        version: 2,
      },
    ]);
    expect(persisted).toMatchObject({ formatVersion: 5 });
    expect(JSON.stringify(persisted)).not.toContain("contextWindowTokens");
  });

  it("atomically adds model-default reasoning and invalidates format 3 chat conformance", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Existing Ollama",
      privateNetworkAccessConfirmed: false,
    });
    const created = await store.createProfile(provider.configuration.revision, {
      label: "Existing profile",
      maxResidentSessions: 1,
      model: "qwen3.5:9b",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 2_048,
        maxToolSteps: 8,
        reasoningEffort: "low",
        toolCallMode: "single-json",
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 60_000,
    });
    await store.setConformance(created.configuration.revision, created.profile.id, {
      checkedAt: "2026-08-25T00:00:00.000Z",
      toolCallMode: "single-json",
    });
    const file = path.join(directory, "agent-config-v1", "configuration.json");
    const legacy = JSON.parse(await readFile(file, "utf8")) as {
      formatVersion: number;
      profiles: Array<{
        conformance: unknown;
        parameters: Record<string, unknown>;
        version: number;
      }>;
    };

    legacy.formatVersion = 3;
    delete legacy.profiles[0]!.parameters.reasoningEffort;
    await writeFile(file, `${JSON.stringify(legacy)}\n`, { mode: 0o600 });

    const migrated = await new AgentConfigurationStore(directory).readSnapshot();
    const persisted = JSON.parse(await readFile(file, "utf8"));

    expect(migrated.profiles[0]).toMatchObject({
      availability: "unavailable",
      conformance: null,
      parameters: { reasoningEffort: "model-default" },
      version: legacy.profiles[0]!.version + 1,
    });
    expect(persisted).toMatchObject({
      formatVersion: 5,
      profiles: [{
        conformance: null,
        parameters: { reasoningEffort: "model-default" },
      }],
    });
  });

  it("fails closed without rewriting an unsafe legacy character-budget migration", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Existing Ollama",
      privateNetworkAccessConfirmed: false,
    });
    await store.createProfile(provider.configuration.revision, {
      label: "Unsafe legacy budget",
      maxResidentSessions: 1,
      model: "legacy-model",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        reasoningEffort: "model-default",
        toolCallMode: "single-json",
      },
      providerId: provider.provider.id,
      timeoutMilliseconds: 60_000,
    });
    const file = path.join(
      directory,
      "agent-config-v1",
      "configuration.json",
    );
    const legacy = JSON.parse(await readFile(file, "utf8")) as {
      formatVersion: number;
      profiles: Array<{ parameters: Record<string, unknown> }>;
    };

    legacy.formatVersion = 2;
    legacy.profiles[0]!.parameters.contextWindowTokens =
      Number.MAX_SAFE_INTEGER;
    delete legacy.profiles[0]!.parameters.historyBudgetCharacters;
    delete legacy.profiles[0]!.parameters.reasoningEffort;
    const source = `${JSON.stringify(legacy)}\n`;

    await writeFile(file, source, { mode: 0o600 });
    await expect(new AgentConfigurationStore(directory).readSnapshot())
      .rejects.toThrow("outside the safe integer range");
    expect(await readFile(file, "utf8")).toBe(source);
  });

  it.each([
    [{
      authenticationType: "none" as const,
      baseUrl: "http://169.254.169.254",
      kind: "ollama" as const,
    }, "outside the allowed network targets"],
    [{
      apiKey: "secret",
      authenticationType: "api-key" as const,
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
