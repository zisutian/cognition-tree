// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentChatReasoningEffort,
  AgentProfileInput,
  AgentProfileView,
  AgentProviderAuthenticationType,
  AgentProviderInput,
  AgentProviderKind,
  AgentProviderView,
  AgentToolCallMode,
} from "../../../application/agent/index.ts";

export type AgentProviderDraft = {
  apiKey: string;
  authenticationType: AgentProviderAuthenticationType;
  baseUrl: string;
  kind: AgentProviderKind;
  label: string;
  privateNetworkAccessConfirmed: boolean;
};

export type AgentProfileDraft = {
  chatReasoningEffort: AgentChatReasoningEffort;
  historyBudgetCharacters: number;
  label: string;
  maxInputCharacters: number;
  maxOutputCharacters: number;
  maxOutputTokens: number;
  maxResidentSessions: number;
  maxToolSteps: number;
  model: string;
  providerId: string;
  reasoningEffort: "high" | "low" | "medium" | "xhigh";
  timeoutMilliseconds: number;
  toolCallMode: AgentToolCallMode;
};

export function createAgentProviderDraft(): AgentProviderDraft {
  return {
    apiKey: "",
    authenticationType: "none",
    baseUrl: "http://127.0.0.1:11434",
    kind: "ollama",
    label: "本地 Ollama",
    privateNetworkAccessConfirmed: false,
  };
}

export function createAgentProfileDraft(): AgentProfileDraft {
  return {
    chatReasoningEffort: "model-default",
    historyBudgetCharacters: 131_072,
    label: "",
    maxInputCharacters: 100_000,
    maxOutputCharacters: 50_000,
    maxOutputTokens: 4_096,
    maxResidentSessions: 1,
    maxToolSteps: 16,
    model: "",
    providerId: "",
    reasoningEffort: "high",
    timeoutMilliseconds: 600_000,
    toolCallMode: "native",
  };
}

export function changeAgentProviderDraftKind(
  draft: AgentProviderDraft,
  kind: AgentProviderKind,
): AgentProviderDraft {
  return {
    ...draft,
    authenticationType: kind === "ollama" ? "none" : "api-key",
    baseUrl: kind === "ollama"
      ? "http://127.0.0.1:11434"
      : kind === "codex" ? "" : draft.baseUrl,
    kind,
    privateNetworkAccessConfirmed: false,
  };
}

export function changeAgentProviderDraftAuthentication(
  draft: AgentProviderDraft,
  authenticationType: AgentProviderAuthenticationType,
): AgentProviderDraft {
  return { ...draft, authenticationType };
}

export function changeAgentProviderDraftBaseUrl(
  draft: AgentProviderDraft,
  baseUrl: string,
): AgentProviderDraft {
  return {
    ...draft,
    baseUrl,
    privateNetworkAccessConfirmed: false,
  };
}

export function agentProviderDraftFrom(
  provider: AgentProviderView,
): AgentProviderDraft {
  return {
    apiKey: "",
    authenticationType: provider.authenticationType,
    baseUrl: provider.baseUrl ?? "",
    kind: provider.kind,
    label: provider.label,
    privateNetworkAccessConfirmed:
      provider.privateNetworkAccess === "confirmed",
  };
}

export function agentProfileDraftFrom(
  profile: AgentProfileView,
): AgentProfileDraft {
  return {
    chatReasoningEffort: profile.parameters.kind === "chat"
      ? profile.parameters.reasoningEffort
      : "model-default",
    historyBudgetCharacters: profile.parameters.kind === "chat"
      ? profile.parameters.historyBudgetCharacters
      : 131_072,
    label: profile.label,
    maxInputCharacters: profile.parameters.kind === "codex"
      ? profile.parameters.maxInputCharacters
      : 100_000,
    maxOutputCharacters: profile.parameters.kind === "codex"
      ? profile.parameters.maxOutputCharacters
      : 50_000,
    maxOutputTokens: profile.parameters.kind === "chat"
      ? profile.parameters.maxOutputTokens
      : 4_096,
    maxResidentSessions: profile.maxResidentSessions,
    maxToolSteps: profile.parameters.kind === "chat"
      ? profile.parameters.maxToolSteps
      : 16,
    model: profile.model,
    providerId: profile.providerId,
    reasoningEffort: profile.parameters.kind === "codex"
      ? profile.parameters.reasoningEffort
      : "high",
    timeoutMilliseconds: profile.timeoutMilliseconds,
    toolCallMode: profile.parameters.kind === "chat"
      ? profile.parameters.toolCallMode
      : "native",
  };
}

export function agentProviderInput(
  draft: AgentProviderDraft,
): AgentProviderInput {
  return {
    ...(draft.authenticationType === "api-key" && draft.apiKey
      ? { apiKey: draft.apiKey }
      : {}),
    authenticationType: draft.authenticationType,
    baseUrl: draft.kind === "codex" ? null : draft.baseUrl,
    kind: draft.kind,
    label: draft.label,
    privateNetworkAccessConfirmed: draft.privateNetworkAccessConfirmed,
  };
}

export function agentProfileInput(
  draft: AgentProfileDraft,
  providerKind: AgentProviderKind,
): AgentProfileInput {
  return {
    label: draft.label,
    maxResidentSessions: draft.maxResidentSessions,
    model: draft.model,
    parameters: providerKind === "codex"
      ? {
          kind: "codex",
          maxInputCharacters: draft.maxInputCharacters,
          maxOutputCharacters: draft.maxOutputCharacters,
          reasoningEffort: draft.reasoningEffort,
        }
      : {
          historyBudgetCharacters: draft.historyBudgetCharacters,
          kind: "chat",
          maxOutputTokens: draft.maxOutputTokens,
          maxToolSteps: draft.maxToolSteps,
          reasoningEffort: draft.chatReasoningEffort,
          toolCallMode: draft.toolCallMode,
        },
    providerId: draft.providerId,
    timeoutMilliseconds: draft.timeoutMilliseconds,
  };
}
