// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  AgentProfileView,
  AgentProviderView,
} from "../../../../application/agent";
import {
  agentProfileDraftFrom,
  agentProfileInput,
  agentProviderDraftFrom,
  agentProviderInput,
  changeAgentProviderDraftAuthentication,
  changeAgentProviderDraftBaseUrl,
  changeAgentProviderDraftKind,
  createAgentProviderDraft,
} from "../../../../presentation/activities/settings/agentSettingsDraft";

describe("agent settings drafts", () => {
  it("keeps provider kind and authentication transitions in one projection", () => {
    const ollama = createAgentProviderDraft();
    const codex = changeAgentProviderDraftKind(
      { ...ollama, privateNetworkAccessConfirmed: true },
      "codex",
    );
    const deviceCode = changeAgentProviderDraftAuthentication(
      codex,
      "chatgpt-device-code",
    );

    expect(codex).toMatchObject({
      authenticationType: "api-key",
      baseUrl: "",
      kind: "codex",
      privateNetworkAccessConfirmed: false,
    });
    expect(deviceCode.authenticationType).toBe("chatgpt-device-code");
  });

  it("requires private-network approval again after the provider URL changes", () => {
    const draft = {
      ...createAgentProviderDraft(),
      privateNetworkAccessConfirmed: true,
    };

    expect(changeAgentProviderDraftBaseUrl(
      draft,
      "http://192.168.1.2:11434",
    )).toMatchObject({
      baseUrl: "http://192.168.1.2:11434",
      privateNetworkAccessConfirmed: false,
    });
  });

  it("leaves an edited provider API key unchanged when the draft is blank", () => {
    const provider = {
      authenticationStatus: "configured",
      authenticationType: "api-key",
      baseUrl: null,
      digest: `sha256:${"2".repeat(64)}` as const,
      id: "codex-provider",
      kind: "codex",
      label: "Codex",
      privateNetworkAccess: "not-required",
      version: 1,
    } satisfies AgentProviderView;
    const input = agentProviderInput(agentProviderDraftFrom(provider));

    expect(input).toEqual({
      authenticationType: "api-key",
      baseUrl: null,
      kind: "codex",
      label: "Codex",
      privateNetworkAccessConfirmed: false,
    });
    expect("apiKey" in input).toBe(false);
  });

  it("round-trips the provider-specific profile fields", () => {
    const profile = {
      availability: "unavailable",
      conformance: null,
      digest: `sha256:${"5".repeat(64)}` as const,
      id: "ollama-local",
      label: "Ollama Local",
      maxResidentSessions: 1,
      model: "qwen3.8:27b",
      parameters: {
        historyBudgetCharacters: 65_536,
        kind: "chat",
        maxOutputTokens: 2_048,
        maxToolSteps: 8,
        reasoningEffort: "model-default",
        toolCallMode: "single-json",
      },
      providerId: "ollama-provider",
      timeoutMilliseconds: 900_000,
      unavailableReason: "Conformance has not been verified",
      version: 3,
    } satisfies AgentProfileView;

    expect(agentProfileInput(agentProfileDraftFrom(profile), "ollama")).toEqual({
      label: profile.label,
      maxResidentSessions: profile.maxResidentSessions,
      model: profile.model,
      parameters: profile.parameters,
      providerId: profile.providerId,
      timeoutMilliseconds: profile.timeoutMilliseconds,
    });
  });

  it("round-trips the Codex profile field set independently", () => {
    const profile = {
      availability: "available",
      conformance: null,
      digest: `sha256:${"6".repeat(64)}` as const,
      id: "codex-safe",
      label: "Codex Safe",
      maxResidentSessions: 2,
      model: "gpt-5.6-codex",
      parameters: {
        kind: "codex",
        maxInputCharacters: 100_000,
        maxOutputCharacters: 50_000,
        reasoningEffort: "xhigh",
      },
      providerId: "codex-provider",
      timeoutMilliseconds: 120_000,
      unavailableReason: null,
      version: 2,
    } satisfies AgentProfileView;

    expect(agentProfileInput(agentProfileDraftFrom(profile), "codex")).toEqual({
      label: profile.label,
      maxResidentSessions: profile.maxResidentSessions,
      model: profile.model,
      parameters: profile.parameters,
      providerId: profile.providerId,
      timeoutMilliseconds: profile.timeoutMilliseconds,
    });
  });
});
