// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AgentConfigurationAccess,
  AgentConfigurationAccessConflictError,
  AgentConfigurationConflictError,
  AgentProfileConfiguration,
  AgentProviderConfiguration,
  createAgentConfigurationViews,
  validateAgentConfigurationRelationships,
  type AgentChatProfileParameters,
  type AgentConfigurationState,
  type AgentProfileInput,
  type AgentProviderInput,
  type StoredProfile,
  type StoredProvider,
} from "../../../../application/agentConfiguration/index.ts";

const providerInput: AgentProviderInput = {
  authenticationType: "none",
  baseUrl: "http://127.0.0.1:11434",
  kind: "ollama",
  label: "Local model",
  privateNetworkAccessConfirmed: false,
};

const provider: StoredProvider = {
  authentication: { type: "none" },
  baseUrl: providerInput.baseUrl,
  id: "provider-1",
  kind: "ollama",
  label: providerInput.label,
  privateNetworkOrigin: null,
  version: 1,
};

const chatParameters: AgentChatProfileParameters = {
    historyBudgetCharacters: 65_536,
    kind: "chat",
    maxOutputTokens: 1_024,
    maxToolSteps: 8,
    reasoningEffort: "model-default",
    toolCallMode: "native",
};

const profileInput: AgentProfileInput = {
  label: "Writer",
  maxResidentSessions: 1,
  model: "local-model",
  parameters: chatParameters,
  providerId: provider.id,
  timeoutMilliseconds: 60_000,
};

function createFixture(initial: AgentConfigurationState = {
  formatVersion: 5,
  profiles: [],
  providers: [provider],
}) {
  let state = structuredClone(initial);
  let nextId = 0;
  const digestedInputs: unknown[] = [];
  const digest = (value: unknown): `sha256:${string}` => {
    digestedInputs.push(structuredClone(value));
    return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
  };
  const views = createAgentConfigurationViews(digest, {
    conformance: 7,
    tool: 11,
  });
  const access = new AgentConfigurationAccess();
  const mutate = async <Result>(operation: (candidate: AgentConfigurationState) =>
    { changed: boolean; result: Result } | Promise<{ changed: boolean; result: Result }>) => {
    const candidate = structuredClone(state);
    const outcome = await operation(candidate);
    if (outcome.changed) state = candidate;
    return outcome.result;
  };
  const read = async <Result>(project: (current: AgentConfigurationState) => Result) =>
    project(structuredClone(state));
  const createId = () => `${++nextId}`;
  const profiles = new AgentProfileConfiguration({ access, createId, mutate, views });
  const providers = new AgentProviderConfiguration({
    access,
    createId,
    credentialStore: {
      activateCodexManagedHome: async () => { throw new Error("unused credential port"); },
      prepareCodexManagedHome: async () => { throw new Error("unused credential port"); },
      remove: async () => {},
      removeCodexStagingHome: async () => {},
      writeApiKey: async () => { throw new Error("unused credential port"); },
    },
    mutate,
    read,
    targetPolicy: { configurationPermission: () => null },
    views,
  });

  return {
    access,
    digestedInputs,
    profiles,
    providers,
    revision: () => views.stateRevision(state),
    snapshot: () => views.configurationSnapshot(state),
    state: () => structuredClone(state),
    views,
  };
}

describe("Agent configuration application rules", () => {
  it("validates provider/profile references and kind compatibility", () => {
    const fixture = createFixture();
    const validProfile: StoredProfile = {
      ...profileInput,
      conformance: null,
      id: "profile-1",
      version: 1,
    };

    expect(() => validateAgentConfigurationRelationships({
      ...fixture.state(),
      profiles: [validProfile],
    })).not.toThrow();
    expect(() => validateAgentConfigurationRelationships({
      ...fixture.state(),
      profiles: [{ ...validProfile, providerId: "missing" }],
    })).toThrow("Profile provider does not exist: missing");
    expect(() => validateAgentConfigurationRelationships({
      ...fixture.state(),
      profiles: [validProfile, validProfile],
    })).toThrow("Profile id is duplicated");
    expect(() => validateAgentConfigurationRelationships({
      ...fixture.state(),
      providers: [provider, provider],
    })).toThrow("Provider id is duplicated");
    expect(() => validateAgentConfigurationRelationships({
      ...fixture.state(),
      profiles: [{ ...validProfile, parameters: {
        kind: "codex",
        maxInputCharacters: 1,
        maxOutputCharacters: 1,
        reasoningEffort: "low",
      } }],
    })).toThrow("Profile parameters do not match provider kind");
  });

  it("advances versions exactly and rejects stale revisions without publishing a candidate", async () => {
    const fixture = createFixture();
    const originalRevision = fixture.revision();
    const created = await fixture.profiles.create(originalRevision, profileInput);

    expect(created.profile.version).toBe(1);
    expect(created.configuration.revision).not.toBe(originalRevision);
    await expect(fixture.profiles.update(originalRevision, created.profile.id, {
      ...profileInput,
      label: "Stale",
    })).rejects.toMatchObject({
      currentRevision: created.configuration.revision,
      name: AgentConfigurationConflictError.name,
    });
    expect(fixture.state().profiles[0]?.label).toBe("Writer");

    const updated = await fixture.profiles.update(created.configuration.revision, created.profile.id, {
      ...profileInput,
      label: "Updated",
    });

    expect(updated.profile.version).toBe(2);
    expect(fixture.state().profiles[0]?.label).toBe("Updated");
    const changedProvider = await fixture.providers.update(
      updated.configuration.revision,
      provider.id,
      { ...providerInput, label: "Renamed local model" },
    );

    expect(changedProvider.provider.version).toBe(2);
    expect(fixture.state().providers[0]?.label).toBe("Renamed local model");
  });

  it("excludes conformance from the Profile digest and includes both contract versions", async () => {
    const fixture = createFixture();
    const created = await fixture.profiles.create(fixture.revision(), profileInput);
    const firstDigest = created.profile.digest;
    const confirmed = await fixture.profiles.setConformance(
      created.configuration.revision,
      created.profile.id,
      { checkedAt: "2026-08-25T00:00:00.000Z", toolCallMode: "native" },
    );

    expect(confirmed.profile.digest).toBe(firstDigest);
    expect(confirmed.profile.availability).toBe("available");
    expect(fixture.digestedInputs).toContainEqual({
      agentConformanceContractVersion: 7,
      agentToolContractVersion: 11,
      configuration: expect.objectContaining({ id: created.profile.id, version: 1 }),
    });
    const profileDigests = fixture.digestedInputs.filter((input) =>
      typeof input === "object" && input !== null &&
      "agentConformanceContractVersion" in input
    );

    for (const input of profileDigests) {
      const { configuration } = input as unknown as { configuration: object };

      expect(configuration).not.toHaveProperty("conformance");
    }
  });

  it("invalidates chat conformance on Provider changes and preserves failed candidates", async () => {
    const fixture = createFixture();
    const created = await fixture.profiles.create(fixture.revision(), profileInput);
    const confirmed = await fixture.profiles.setConformance(
      created.configuration.revision,
      created.profile.id,
      { checkedAt: "2026-08-25T00:00:00.000Z", toolCallMode: "native" },
    );

    await expect(fixture.providers.delete(confirmed.configuration.revision, provider.id))
      .rejects.toThrow("Delete profiles that reference this provider first");
    expect(fixture.state().profiles[0]?.conformance).not.toBeNull();
    const updated = await fixture.providers.update(
      confirmed.configuration.revision,
      provider.id,
      { ...providerInput, baseUrl: "http://127.0.0.1:11435" },
    );

    expect(updated.configuration.profiles[0]).toMatchObject({
      availability: "unavailable",
      conformance: null,
      unavailableReason: "Tool-call conformance has not been verified",
    });
  });

  it("allows reading a stored two-step chat Profile but rejects a new two-step write", async () => {
    const stored: StoredProfile = {
      ...profileInput,
      conformance: null,
      id: "profile-existing",
      parameters: { ...chatParameters, maxToolSteps: 2 },
      version: 1,
    };
    const fixture = createFixture({
      formatVersion: 5,
      profiles: [stored],
      providers: [provider],
    });

    expect(fixture.snapshot().profiles[0]).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Chat profiles require at least 3 tool steps",
    });
    await expect(fixture.profiles.create(fixture.revision(), {
      ...profileInput,
      parameters: { ...chatParameters, maxToolSteps: 2 },
    })).rejects.toThrow("Chat profiles require at least 3 tool steps");
    expect(fixture.state().profiles).toEqual([stored]);
  });

  it("rejects unsupported chat settings for a non-Ollama Provider", async () => {
    const fixture = createFixture({
      formatVersion: 5,
      profiles: [],
      providers: [{ ...provider, kind: "openai-chat", baseUrl: "https://models.example.invalid/v1" }],
    });
    const revision = fixture.revision();

    await expect(fixture.profiles.create(revision, {
      ...profileInput,
      parameters: { ...chatParameters, toolCallMode: "single-json" },
    })).rejects.toThrow("single-json is only valid for Ollama profiles");
    await expect(fixture.profiles.create(revision, {
      ...profileInput,
      parameters: { ...chatParameters, reasoningEffort: "low" },
    })).rejects.toThrow("Explicit chat reasoning effort is only valid for Ollama profiles");
    expect(fixture.state().profiles).toEqual([]);
  });

  it("enforces active-use leases while allowing a Profile edit", async () => {
    const fixture = createFixture();
    const created = await fixture.profiles.create(fixture.revision(), profileInput);
    const use = fixture.access.beginProfileUse(created.profile.id);

    use.bindProvider(provider.id);
    await expect(fixture.providers.update(
      created.configuration.revision,
      provider.id,
      { ...providerInput, label: "Blocked" },
    )).rejects.toBeInstanceOf(AgentConfigurationAccessConflictError);
    await expect(fixture.profiles.delete(created.configuration.revision, created.profile.id))
      .rejects.toBeInstanceOf(AgentConfigurationAccessConflictError);
    expect(fixture.state().providers[0]?.label).toBe(provider.label);
    const edited = await fixture.profiles.update(
      created.configuration.revision,
      created.profile.id,
      { ...profileInput, label: "Allowed" },
    );

    expect(edited.profile.label).toBe("Allowed");
    use.release();
    const change = await fixture.providers.reserveChange(edited.configuration.revision, provider.id);

    expect(() => fixture.access.beginProfileUse(created.profile.id))
      .toThrow(AgentConfigurationAccessConflictError);
    change.release();
  });
});
