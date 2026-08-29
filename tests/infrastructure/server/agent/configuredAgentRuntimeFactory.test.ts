// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { CodexRuntime } from "../../../../infrastructure/server/agent/codexRuntime.ts";
import {
  ConfiguredAgentRuntimeFactory,
} from "../../../../infrastructure/server/agent/configuredAgentRuntimeFactory.ts";
import type {
  ResolvedAgentConfiguration,
} from "../../../../infrastructure/server/agent/configurationStore.ts";
import { OllamaRuntime } from "../../../../infrastructure/server/agent/ollamaRuntime.ts";
import { OpenAiChatRuntime } from "../../../../infrastructure/server/agent/openAiChatRuntime.ts";
import {
  createAgentRuntimeProfile,
} from "../../../../infrastructure/server/agent/runtimeProfiles.ts";

const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
const scope = { domain: "journal" as const, entryIds: null };

function chatConfiguration(
  kind: "ollama" | "openai-chat",
  {
    apiKey = kind === "openai-chat" ? "server-secret" : null,
    authenticationType = kind === "openai-chat" ? "api-key" : "none",
    privateNetworkOrigin = null,
  }: {
    apiKey?: string | null;
    authenticationType?: "api-key" | "none";
    privateNetworkOrigin?: string | null;
  } = {},
): ResolvedAgentConfiguration {
  const providerId = `provider-${kind}`;

  return {
    apiKey,
    codexHome: null,
    privateNetworkOrigin,
    profile: {
      availability: "available",
      conformance: null,
      digest,
      id: `profile-${kind}`,
      label: `${kind} profile`,
      maxResidentSessions: 3,
      model: `${kind}-model`,
      parameters: {
        historyBudgetCharacters: 23_456,
        kind: "chat",
        maxOutputTokens: 777,
        maxToolSteps: 4,
        reasoningEffort: "model-default",
        toolCallMode: kind === "ollama" ? "single-json" : "native",
      },
      providerId,
      timeoutMilliseconds: 12_345,
      unavailableReason: null,
      version: 7,
    },
    provider: {
      authenticationStatus: authenticationType === "none"
        ? "not-required"
        : apiKey
          ? "configured"
          : "missing",
      authenticationType,
      baseUrl: kind === "ollama"
        ? `https://${kind}.example`
        : `https://${kind}.example/v1`,
      digest,
      id: providerId,
      kind,
      label: `${kind} provider`,
      privateNetworkAccess: privateNetworkOrigin ? "confirmed" : "not-required",
      version: 5,
    },
  };
}

function codexConfiguration({
  apiKey,
  authenticationType,
  codexHome,
}: {
  apiKey: string | null;
  authenticationType: "api-key" | "chatgpt-device-code";
  codexHome: string | null;
}): ResolvedAgentConfiguration {
  return {
    apiKey,
    codexHome,
    privateNetworkOrigin: null,
    profile: {
      availability: "available",
      conformance: null,
      digest,
      id: "profile-codex",
      label: "Codex profile",
      maxResidentSessions: 2,
      model: "gpt-codex-test",
      parameters: {
        kind: "codex",
        maxInputCharacters: 45_678,
        maxOutputCharacters: 9_876,
        reasoningEffort: "high",
      },
      providerId: "provider-codex",
      timeoutMilliseconds: 54_321,
      unavailableReason: null,
      version: 9,
    },
    provider: {
      authenticationStatus: apiKey || codexHome ? "configured" : "missing",
      authenticationType,
      baseUrl: null,
      digest,
      id: "provider-codex",
      kind: "codex",
      label: "Codex provider",
      privateNetworkAccess: "not-required",
      version: 6,
    },
  };
}

function completionResponse() {
  return new Response([
    `data: ${JSON.stringify({
      choices: [{ delta: { content: "done" }, finish_reason: null }],
    })}`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    })}`,
    "data: [DONE]",
    "",
  ].join("\n\n"), {
    headers: { "Content-Type": "text/event-stream" },
    status: 200,
  });
}

async function runChatTurn(runtime: OllamaRuntime | OpenAiChatRuntime) {
  const session = await runtime.openSession({
    instructions: "Factory test instructions",
    profileId: "factory-test",
    scope,
    sessionId: "00000000-0000-4000-8000-000000000001",
  });

  try {
    return await session.runTurn({
      executeTool: vi.fn(async () => undefined),
      messages: [{ content: "Run once", role: "user" }],
      onEvent: vi.fn(),
      scope,
      signal: new AbortController().signal,
      tools: [],
    });
  } finally {
    await session.dispose();
  }
}

describe("ConfiguredAgentRuntimeFactory", () => {
  it.each([
    {
      configuration: codexConfiguration({
        apiKey: "codex-secret",
        authenticationType: "api-key",
        codexHome: null,
      }),
      expectedKind: "codex",
      Runtime: CodexRuntime,
    },
    {
      configuration: chatConfiguration("ollama"),
      expectedKind: "ollama",
      Runtime: OllamaRuntime,
    },
    {
      configuration: chatConfiguration("openai-chat"),
      expectedKind: "openai-chat",
      Runtime: OpenAiChatRuntime,
    },
  ])("creates the configured $expectedKind runtime", ({
    configuration,
    expectedKind,
    Runtime,
  }) => {
    const profile = createAgentRuntimeProfile(configuration);
    const runtime = new ConfiguredAgentRuntimeFactory({
      projectRoot: "/tmp/cognition-tree-runtime-factory",
    }).create({ configuration, profile });

    expect(runtime).toBeInstanceOf(Runtime);
    expect(runtime.kind).toBe(expectedKind);
    expect(profile).toMatchObject({
      ...configuration.profile.parameters,
      id: configuration.profile.id,
      kind: expectedKind,
      model: configuration.profile.model,
      timeoutMilliseconds: configuration.profile.timeoutMilliseconds,
    });
  });

  it("supports both configured Codex authentication modes", () => {
    const factory = new ConfiguredAgentRuntimeFactory();
    const configurations = [
      codexConfiguration({
        apiKey: "codex-secret",
        authenticationType: "api-key",
        codexHome: null,
      }),
      codexConfiguration({
        apiKey: null,
        authenticationType: "chatgpt-device-code",
        codexHome: "/tmp/codex-device-home",
      }),
    ];

    for (const configuration of configurations) {
      expect(factory.create({
        configuration,
        profile: createAgentRuntimeProfile(configuration),
      })).toBeInstanceOf(CodexRuntime);
    }
  });

  it.each([
    codexConfiguration({
      apiKey: null,
      authenticationType: "api-key",
      codexHome: null,
    }),
    codexConfiguration({
      apiKey: null,
      authenticationType: "chatgpt-device-code",
      codexHome: null,
    }),
  ])("rejects unavailable Codex credentials", (configuration) => {
    expect(() => new ConfiguredAgentRuntimeFactory().create({
      configuration,
      profile: createAgentRuntimeProfile(configuration),
    })).toThrow("Agent provider credential is unavailable");
  });

  it("keeps the caller-owned OpenAI missing-key policy explicit", () => {
    const configuration = chatConfiguration("openai-chat", {
      apiKey: null,
      authenticationType: "none",
    });
    const profile = createAgentRuntimeProfile(configuration);
    const factory = new ConfiguredAgentRuntimeFactory();

    expect(() => factory.create({ configuration, profile })).toThrow(
      "Agent provider credential is unavailable",
    );
    expect(factory.create({
      configuration,
      openAiAuthentication: "allow-unauthenticated",
      profile,
    })).toBeInstanceOf(OpenAiChatRuntime);
  });

  it("rejects profile identity and provider-kind mismatches", () => {
    const configuration = chatConfiguration("openai-chat");
    const profile = createAgentRuntimeProfile(configuration);
    const factory = new ConfiguredAgentRuntimeFactory();

    expect(() => factory.create({
      configuration,
      profile: { ...profile, id: "another-profile" },
    })).toThrow("Agent runtime profile does not match its configuration");
    expect(() => factory.create({
      configuration,
      profile: {
        ...createAgentRuntimeProfile(chatConfiguration("ollama")),
        id: configuration.profile.id,
      },
    })).toThrow("Agent runtime profile does not match its provider");
  });

  it.each([
    {
      apiKey: "ollama-secret",
      authenticationType: "api-key" as const,
      caseName: "Ollama with a configured key",
      kind: "ollama" as const,
      openAiAuthentication: undefined,
      sendsAuthorization: false,
    },
    {
      apiKey: "openai-secret",
      authenticationType: "api-key" as const,
      caseName: "authenticated OpenAI",
      kind: "openai-chat" as const,
      openAiAuthentication: undefined,
      sendsAuthorization: true,
    },
    {
      apiKey: null,
      authenticationType: "none" as const,
      caseName: "unauthenticated OpenAI conformance",
      kind: "openai-chat" as const,
      openAiAuthentication: "allow-unauthenticated" as const,
      sendsAuthorization: false,
    },
  ])("revalidates every $caseName request and preserves its request profile", async ({
    apiKey,
    authenticationType,
    kind,
    openAiAuthentication,
    sendsAuthorization,
  }) => {
    const privateNetworkOrigin = `https://${kind}.example`;
    const configuration = chatConfiguration(kind, {
      apiKey,
      authenticationType,
      privateNetworkOrigin,
    });
    const assertRequestTarget = vi.fn(async (
      _target: URL,
      _permittedOrigin: string | null,
    ) => undefined);
    const factory = new ConfiguredAgentRuntimeFactory({
      targetPolicy: { assertRequestTarget },
    });
    const configuredProfile = createAgentRuntimeProfile(configuration);

    if (configuredProfile.kind === "codex") {
      throw new Error("Chat factory test resolved an unexpected Codex profile");
    }
    const requestProfile = {
      ...configuredProfile,
      maxOutputTokens: 333,
      model: `${kind}-request-model`,
      timeoutMilliseconds: 23_456,
    };
    const runtime = factory.create({
      configuration,
      ...(openAiAuthentication ? { openAiAuthentication } : {}),
      profile: requestProfile,
    }) as OllamaRuntime | OpenAiChatRuntime;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => completionResponse(),
    );

    try {
      await runChatTurn(runtime);
      await runChatTurn(runtime);

      expect(assertRequestTarget).toHaveBeenCalledTimes(2);
      for (const [target, permittedOrigin] of assertRequestTarget.mock.calls) {
        expect(target.toString()).toBe(configuration.provider.baseUrl);
        expect(permittedOrigin).toBe(privateNetworkOrigin);
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const request = fetchMock.mock.calls[0]?.[1];
      const headers = new Headers(request?.headers);
      const body = JSON.parse(String(request?.body)) as Record<string, unknown>;

      expect(headers.get("Authorization")).toBe(
        sendsAuthorization ? `Bearer ${apiKey}` : null,
      );
      expect(body).toMatchObject({
        max_tokens: requestProfile.maxOutputTokens,
        model: requestProfile.model,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("fails closed before dispatch when the configured target is rejected", async () => {
    const configuration = chatConfiguration("openai-chat");
    const denied = new Error("target denied");
    const factory = new ConfiguredAgentRuntimeFactory({
      targetPolicy: {
        assertRequestTarget: vi.fn(async () => {
          throw denied;
        }),
      },
    });
    const runtime = factory.create({
      configuration,
      profile: createAgentRuntimeProfile(configuration),
    }) as OpenAiChatRuntime;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      await expect(runChatTurn(runtime)).rejects.toBe(denied);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
