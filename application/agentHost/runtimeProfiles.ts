// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentChatProfileParameters,
  AgentCodexProfileParameters,
} from "../agent/agentConfiguration.ts";
import type { ResolvedAgentConfiguration } from "./configurationPort.ts";

type AgentRuntimeProfileBase = {
  id: string;
  label: string;
  maxResidentSessions: number;
  model: string;
  timeoutMilliseconds: number;
};

export type CodexAgentProfile = AgentRuntimeProfileBase &
  Omit<AgentCodexProfileParameters, "kind"> & { kind: "codex" };

export type OpenAiChatAgentProfile = AgentRuntimeProfileBase &
  Omit<AgentChatProfileParameters, "kind" | "toolCallMode"> & {
    baseUrl: string;
    kind: "openai-chat";
    toolCallMode: "native";
  };

export type OllamaAgentProfile = AgentRuntimeProfileBase &
  Omit<AgentChatProfileParameters, "kind"> & {
    baseUrl: string;
    kind: "ollama";
  };

export type AgentRuntimeProfile =
  | CodexAgentProfile
  | OllamaAgentProfile
  | OpenAiChatAgentProfile;

export function createAgentRuntimeProfile(
  configuration: ResolvedAgentConfiguration,
): AgentRuntimeProfile {
  const { profile, provider } = configuration;

  if (profile.parameters.kind === "codex") {
    if (provider.kind !== "codex") {
      throw new Error("Codex profile does not match its provider");
    }
    return {
      id: profile.id,
      kind: "codex",
      label: profile.label,
      maxInputCharacters: profile.parameters.maxInputCharacters,
      maxOutputCharacters: profile.parameters.maxOutputCharacters,
      maxResidentSessions: profile.maxResidentSessions,
      model: profile.model,
      reasoningEffort: profile.parameters.reasoningEffort,
      timeoutMilliseconds: profile.timeoutMilliseconds,
    };
  }
  if (provider.kind === "ollama") {
    if (provider.baseUrl === null) {
      throw new Error("Ollama provider requires a base URL");
    }
    return {
      baseUrl: `${provider.baseUrl.replace(/\/$/, "")}/v1`,
      historyBudgetCharacters: profile.parameters.historyBudgetCharacters,
      id: profile.id,
      kind: "ollama",
      label: profile.label,
      maxOutputTokens: profile.parameters.maxOutputTokens,
      maxResidentSessions: profile.maxResidentSessions,
      maxToolSteps: profile.parameters.maxToolSteps,
      model: profile.model,
      reasoningEffort: profile.parameters.reasoningEffort,
      timeoutMilliseconds: profile.timeoutMilliseconds,
      toolCallMode: profile.parameters.toolCallMode,
    };
  }
  if (provider.kind !== "openai-chat" || provider.baseUrl === null) {
    throw new Error("OpenAI-compatible profile does not match its provider");
  }
  if (profile.parameters.toolCallMode !== "native") {
    throw new Error("OpenAI-compatible profiles require native tool calls");
  }
  return {
    baseUrl: provider.baseUrl,
    historyBudgetCharacters: profile.parameters.historyBudgetCharacters,
    id: profile.id,
    kind: "openai-chat",
    label: profile.label,
    maxOutputTokens: profile.parameters.maxOutputTokens,
    maxResidentSessions: profile.maxResidentSessions,
    maxToolSteps: profile.parameters.maxToolSteps,
    model: profile.model,
    reasoningEffort: profile.parameters.reasoningEffort,
    timeoutMilliseconds: profile.timeoutMilliseconds,
    toolCallMode: "native",
  };
}
