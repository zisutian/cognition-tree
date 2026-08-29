// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createInitialAgentConfigurationState,
  materializeLegacyAgentConfigurationState,
  parseAgentConfigurationState,
} from "../../../../infrastructure/server/agent/configurationStateCodec.ts";

const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

type StateFixture = {
  formatVersion: number;
  profiles: Array<{
    conformance: null | {
      checkedAt: string;
      profileDigest: string;
      providerDigest: string;
      toolCallMode: string;
    };
    id: string;
    label: string;
    maxResidentSessions: number;
    model: string;
    parameters: Record<string, unknown>;
    providerId: string;
    timeoutMilliseconds: number;
    version: number;
  }>;
  providers: Array<{
    authentication: Record<string, unknown>;
    baseUrl: string | null;
    id: string;
    kind: string;
    label: string;
    privateNetworkOrigin?: string | null;
    version: number;
    unexpected?: boolean;
  }>;
};

function currentState(): StateFixture {
  return {
    formatVersion: 5,
    profiles: [{
      conformance: {
        checkedAt: "2026-08-25T00:00:00.000Z",
        profileDigest: digest,
        providerDigest: digest,
        toolCallMode: "native",
      },
      id: "profile-1",
      label: "Current profile",
      maxResidentSessions: 1,
      model: "current-model",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 1_024,
        maxToolSteps: 8,
        reasoningEffort: "model-default",
        toolCallMode: "native",
      },
      providerId: "provider-1",
      timeoutMilliseconds: 60_000,
      version: 1,
    }],
    providers: [{
      authentication: {
        credential: {
          digest,
          reference: "providers/provider-1/api-key-v2.json",
          version: 2,
        },
        type: "api-key",
      },
      baseUrl: "https://models.example.invalid/v1",
      id: "provider-1",
      kind: "openai-chat",
      label: "Current provider",
      privateNetworkOrigin: null,
      version: 1,
    }],
  };
}

function legacyState(version: 1 | 2 | 3 | 4) {
  const state = currentState();

  state.formatVersion = version;
  state.providers[0]!.authentication = { type: "none" };
  if (version === 1) delete state.providers[0]!.privateNetworkOrigin;
  if (version <= 2) {
    state.profiles[0]!.parameters.contextWindowTokens =
      Number(state.profiles[0]!.parameters.historyBudgetCharacters) / 4;
    delete state.profiles[0]!.parameters.historyBudgetCharacters;
  }
  if (version <= 3) {
    delete state.profiles[0]!.parameters.reasoningEffort;
  }
  return state;
}

describe("Agent configuration state codec", () => {
  it("round-trips fresh and current persisted states", async () => {
    const fresh = createInitialAgentConfigurationState();
    const current = currentState();
    const parsedCurrent = parseAgentConfigurationState(
      JSON.parse(JSON.stringify(current)) as unknown,
    );
    let writes = 0;

    expect(parseAgentConfigurationState(
      JSON.parse(JSON.stringify(fresh)) as unknown,
    )).toEqual(fresh);
    expect(parsedCurrent).toEqual(current);
    expect(await materializeLegacyAgentConfigurationState(
      parsedCurrent,
      async () => {
        writes += 1;
        throw new Error("Current format must not materialize a credential");
      },
    )).toBe(false);
    expect(writes).toBe(0);
  });

  it("rejects unknown persisted fields", () => {
    const state = currentState();

    state.providers[0]!.unexpected = true;

    expect(() => parseAgentConfigurationState(state)).toThrow(
      "providers[0] has unsupported or missing fields",
    );
  });

  it.each([
    ["provider id", () => {
      const state = currentState();

      state.providers.push(structuredClone(state.providers[0]!));
      return state;
    }, "Provider id is duplicated"],
    ["profile id", () => {
      const state = currentState();

      state.profiles.push(structuredClone(state.profiles[0]!));
      return state;
    }, "Profile id is duplicated"],
    ["missing provider", () => {
      const state = currentState();

      state.profiles[0]!.providerId = "missing-provider";
      return state;
    }, "Profile provider does not exist: missing-provider"],
  ] as const)("rejects %s relationships", (_label, createState, message) => {
    expect(() => parseAgentConfigurationState(createState())).toThrow(message);
  });

  it.each([
    [1, 65_536, null],
    [2, 65_536, null],
    [3, 65_536, null],
  ] as const)(
    "upgrades format %s chat parameters and invalidates conformance",
    async (version, expectedBudget, expectedConformance) => {
      const parsed = parseAgentConfigurationState(legacyState(version));

      expect(parsed).toMatchObject({
        formatVersion: 5,
        profiles: [{
          conformance: expectedConformance,
          parameters: {
            historyBudgetCharacters: expectedBudget,
            reasoningEffort: "model-default",
          },
          version: 2,
        }],
        providers: [{ privateNetworkOrigin: null }],
      });
      expect(await materializeLegacyAgentConfigurationState(
        parsed,
        async () => {
          throw new Error("Formats 1-3 must not materialize a credential");
        },
      )).toBe(true);
      expect(await materializeLegacyAgentConfigurationState(
        parsed,
        async () => {
          throw new Error("A rewritten state must not materialize a credential");
        },
      )).toBe(false);
    },
  );

  it("materializes format 4 inline secrets before dropping legacy authority", async () => {
    const legacy = legacyState(4);

    legacy.providers[0]!.authentication = {
      apiKey: "legacy-provider-secret",
      type: "bearer",
    };
    const parsed = parseAgentConfigurationState(legacy);
    const writes: unknown[] = [];
    const changed = await materializeLegacyAgentConfigurationState(
      parsed,
      async (providerId, apiKey, version) => {
        writes.push({ apiKey, providerId, version });
        return {
          digest,
          reference: `providers/${providerId}/api-key-v${version}.json`,
          version,
        };
      },
    );

    expect(JSON.stringify(parseAgentConfigurationState(legacy)))
      .not.toContain("legacy-provider-secret");
    expect(changed).toBe(true);
    expect(writes).toEqual([{
      apiKey: "legacy-provider-secret",
      providerId: "provider-1",
      version: 1,
    }]);
    expect(parsed).toMatchObject({
      profiles: [{ conformance: null }],
      providers: [{
        authentication: {
          credential: {
            reference: "providers/provider-1/api-key-v1.json",
            version: 1,
          },
          type: "api-key",
        },
      }],
    });
  });

  it("rejects unsafe legacy character-budget expansion", () => {
    const legacy = legacyState(2);

    legacy.profiles[0]!.parameters.contextWindowTokens =
      Number.MAX_SAFE_INTEGER;

    expect(() => parseAgentConfigurationState(legacy)).toThrow(
      "historyBudgetCharacters is outside the safe integer range",
    );
  });
});
