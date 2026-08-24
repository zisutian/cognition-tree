// SPDX-License-Identifier: GPL-3.0-or-later

export type AgentProviderKind = "codex" | "ollama" | "openai-chat";
export type AgentToolCallMode = "native" | "single-json";

export type AgentProviderView = Readonly<{
  authenticationStatus: "configured" | "missing" | "not-required";
  baseUrl: string | null;
  digest: `sha256:${string}`;
  id: string;
  kind: AgentProviderKind;
  label: string;
  version: number;
}>;

export type AgentCodexProfileParameters = Readonly<{
  kind: "codex";
  maxInputCharacters: number;
  maxOutputCharacters: number;
  reasoningEffort: "high" | "low" | "medium" | "xhigh";
}>;

export type AgentChatProfileParameters = Readonly<{
  contextWindowTokens: number;
  kind: "chat";
  maxOutputTokens: number;
  maxToolSteps: number;
  toolCallMode: AgentToolCallMode;
}>;

export type AgentProfileParameters =
  | AgentChatProfileParameters
  | AgentCodexProfileParameters;

export type AgentProfileConformance = Readonly<{
  checkedAt: string;
  profileDigest: `sha256:${string}`;
  providerDigest: `sha256:${string}`;
  toolCallMode: AgentToolCallMode;
}>;

export type AgentProfileView = Readonly<{
  availability: "available" | "unavailable";
  conformance: AgentProfileConformance | null;
  digest: `sha256:${string}`;
  id: string;
  label: string;
  maxResidentSessions: number;
  model: string;
  parameters: AgentProfileParameters;
  providerId: string;
  timeoutMilliseconds: number;
  unavailableReason: string | null;
  version: number;
}>;

export type AgentConfigurationSnapshot = Readonly<{
  profiles: readonly AgentProfileView[];
  providers: readonly AgentProviderView[];
  revision: `sha256:${string}`;
}>;
