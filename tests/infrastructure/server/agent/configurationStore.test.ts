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
import { AgentConfigurationStore } from "../../../../infrastructure/server/agent/configurationStore.ts";
import { AgentConfigurationConflictError, AgentConfigurationValidationError } from "../../../../application/agentHost/configurationErrors.ts";
import {
  AgentConfigurationAccessConflictError,
} from "../../../../application/agentHost/configurationAccess.ts";
import {
  replaceFileDurably,
} from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import {
  SecureStateCommitOutcomeUnknownError,
} from "../../../../infrastructure/server/state/secureJsonPartition.ts";

const directories: string[] = [];

async function createStore({
  replaceConfigurationFile,
}: {
  replaceConfigurationFile?: typeof replaceFileDurably;
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-config-"));
  const ids = ["provider-1", "profile-1", "provider-2", "profile-2"];

  directories.push(directory);
  return {
    directory,
    store: new AgentConfigurationStore(directory, {
      createId: () => ids.shift() ?? "unexpected-id",
      ...(replaceConfigurationFile ? { replaceConfigurationFile } : {}),
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

  it("removes rejected API-key candidates and reconciles an unknown commit", async () => {
    let failure: "before" | "after" | null = null;
    const { directory, store } = await createStore({
      replaceConfigurationFile: async (file, source, options) => {
        if (failure === "before") {
          failure = null;
          throw new Error("configuration replacement failed");
        }
        await replaceFileDurably(file, source, options);
        if (failure === "after") {
          failure = null;
          throw new Error("directory sync failed after replacement");
        }
      },
    });
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
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

    failure = "before";
    await expect(store.updateProvider(
      created.configuration.revision,
      created.provider.id,
      {
        apiKey: "rejected-secret",
        authenticationType: "api-key",
        baseUrl: "https://models.example.invalid/v1",
        kind: "openai-chat",
        label: "Provider",
        privateNetworkAccessConfirmed: false,
      },
    )).rejects.toThrow("configuration replacement failed");
    await expect(access(path.join(providerDirectory, "api-key-v1.json")))
      .rejects.toMatchObject({ code: "ENOENT" });

    const accepted = await store.updateProvider(
      created.configuration.revision,
      created.provider.id,
      {
        apiKey: "first-secret",
        authenticationType: "api-key",
        baseUrl: "https://models.example.invalid/v1",
        kind: "openai-chat",
        label: "Provider",
        privateNetworkAccessConfirmed: false,
      },
    );

    failure = "after";
    await expect(store.updateProvider(
      accepted.configuration.revision,
      created.provider.id,
      {
        apiKey: "second-secret",
        authenticationType: "api-key",
        baseUrl: "https://models.example.invalid/v1",
        kind: "openai-chat",
        label: "Provider",
        privateNetworkAccessConfirmed: false,
      },
    )).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);

    const reloaded = new AgentConfigurationStore(directory);

    await expect(reloaded.resolveProvider(created.provider.id)).resolves
      .toMatchObject({ apiKey: "second-secret" });
    await expect(access(path.join(providerDirectory, "api-key-v1.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(providerDirectory, "api-key-v2.json"), "utf8"))
      .toContain("second-secret");
  });

  it("linearizes provider changes against profile use without freezing profile edits", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const provider = await store.createProvider(initial.revision, {
      apiKey: "provider-secret",
      authenticationType: "api-key",
      baseUrl: "https://models.example.invalid/v1",
      kind: "openai-chat",
      label: "Provider",
      privateNetworkAccessConfirmed: false,
    });
    const profile = await store.createProfile(provider.configuration.revision, {
      label: "Writer",
      maxResidentSessions: 1,
      model: "model",
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
    const use = store.access.beginProfileUse(profile.profile.id);

    try {
      await expect(store.resolveProfile(profile.profile.id, use)).resolves
        .toMatchObject({ apiKey: "provider-secret" });
      await expect(store.updateProvider(
        profile.configuration.revision,
        provider.provider.id,
        {
          authenticationType: "api-key",
          baseUrl: "https://models.example.invalid/v1",
          kind: "openai-chat",
          label: "Changed provider",
          privateNetworkAccessConfirmed: false,
        },
      )).rejects.toBeInstanceOf(AgentConfigurationAccessConflictError);
      await expect(store.deleteProfile(
        profile.configuration.revision,
        profile.profile.id,
      )).rejects.toBeInstanceOf(AgentConfigurationAccessConflictError);
      await expect(store.updateProfile(
        profile.configuration.revision,
        profile.profile.id,
        {
          label: "Changed writer",
          maxResidentSessions: 1,
          model: "model-2",
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
        },
      )).resolves.toMatchObject({ profile: { label: "Changed writer" } });
    } finally {
      use.release();
    }
    const current = await store.readSnapshot();
    const change = await store.reserveProviderChange(
      current.revision,
      provider.provider.id,
    );

    try {
      expect(() => store.access.beginProfileUse(profile.profile.id))
        .toThrow(AgentConfigurationAccessConflictError);
    } finally {
      change.release();
    }
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
    await expect(store.removeCodexDeviceLoginStaging(
      created.provider.id,
      prepared.credentialVersion,
      loginId,
    )).rejects.toThrow("cannot be removed as staging");
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      codexHome: prepared.home,
    });

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

  it("retains activated Codex authentication when its configuration commit is unknown", async () => {
    let failAfterReplacement = false;
    const { directory, store } = await createStore({
      replaceConfigurationFile: async (file, source, options) => {
        await replaceFileDurably(file, source, options);
        if (failAfterReplacement) {
          failAfterReplacement = false;
          throw new Error("directory sync failed after replacement");
        }
      },
    });
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      authenticationType: "chatgpt-device-code",
      baseUrl: null,
      kind: "codex",
      label: "ChatGPT Codex",
      privateNetworkAccessConfirmed: false,
    });
    const loginId = "00000000-0000-4000-8000-000000000005";
    const prepared = await store.prepareCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      loginId,
    );

    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    failAfterReplacement = true;

    await expect(store.completeCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      prepared.credentialVersion,
      loginId,
    )).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);

    const reloaded = new AgentConfigurationStore(directory);

    await expect(reloaded.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: null,
      codexHome: prepared.home,
      provider: {
        authenticationStatus: "configured",
        version: 2,
      },
    });
  });

  it("removes activated Codex authentication when a terminal partition blocks its candidate", async () => {
    let failAfterReplacement = false;
    const { directory, store } = await createStore({
      replaceConfigurationFile: async (file, source, options) => {
        await replaceFileDurably(file, source, options);
        if (failAfterReplacement) {
          failAfterReplacement = false;
          throw new Error("directory sync failed after replacement");
        }
      },
    });
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      authenticationType: "chatgpt-device-code",
      baseUrl: null,
      kind: "codex",
      label: "ChatGPT Codex",
      privateNetworkAccessConfirmed: false,
    });
    const loginId = "00000000-0000-4000-8000-000000000006";
    const prepared = await store.prepareCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      loginId,
    );

    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    failAfterReplacement = true;
    await expect(store.createProfile(created.configuration.revision, {
      label: "Primary Codex",
      maxResidentSessions: 1,
      model: "gpt-5-codex",
      parameters: {
        kind: "codex",
        maxInputCharacters: 100_000,
        maxOutputCharacters: 50_000,
        reasoningEffort: "high",
      },
      providerId: created.provider.id,
      timeoutMilliseconds: 120_000,
    })).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);

    await expect(store.completeCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      prepared.credentialVersion,
      loginId,
    )).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    await expect(access(prepared.home)).rejects.toMatchObject({ code: "ENOENT" });

    const reloaded = new AgentConfigurationStore(directory);

    await expect(reloaded.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: null,
      codexHome: null,
      provider: { authenticationStatus: "missing" },
    });
  });

  it("keeps newly committed Codex authentication when old credential cleanup fails", async () => {
    const { directory, store } = await createStore();
    const initial = await store.readSnapshot();
    const created = await store.createProvider(initial.revision, {
      authenticationType: "chatgpt-device-code",
      baseUrl: null,
      kind: "codex",
      label: "ChatGPT Codex",
      privateNetworkAccessConfirmed: false,
    });
    const firstLoginId = "00000000-0000-4000-8000-000000000003";
    const firstPrepared = await store.prepareCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      firstLoginId,
    );

    await writeFile(path.join(firstPrepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    const firstAuthenticated = await store.completeCodexDeviceLogin(
      created.configuration.revision,
      created.provider.id,
      firstPrepared.credentialVersion,
      firstLoginId,
    );
    const secondLoginId = "00000000-0000-4000-8000-000000000004";
    const secondPrepared = await store.prepareCodexDeviceLogin(
      firstAuthenticated.revision,
      created.provider.id,
      secondLoginId,
    );

    await writeFile(path.join(secondPrepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    await rm(path.join(
      directory,
      "agent-auth-v1",
      "providers",
      created.provider.id,
      `codex-managed-v${firstPrepared.credentialVersion}-${firstLoginId}.json`,
    ));

    await expect(store.completeCodexDeviceLogin(
      firstAuthenticated.revision,
      created.provider.id,
      secondPrepared.credentialVersion,
      secondLoginId,
    )).resolves.toMatchObject({
      providers: [{
        authenticationStatus: "configured",
        version: 3,
      }],
    });
    await expect(store.resolveProvider(created.provider.id)).resolves.toMatchObject({
      apiKey: null,
      codexHome: secondPrepared.home,
      provider: {
        authenticationStatus: "configured",
        version: 3,
      },
    });
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
