// SPDX-License-Identifier: GPL-3.0-or-later

export type AgentProviderKind = "codex" | "ollama" | "openai-chat";
export type AgentToolCallMode = "native" | "single-json";
export type AgentChatReasoningEffort =
  | "high"
  | "low"
  | "medium"
  | "model-default"
  | "none";

export type AgentProviderView = Readonly<{
  authenticationStatus: "configured" | "missing" | "not-required";
  baseUrl: string | null;
  digest: `sha256:${string}`;
  id: string;
  kind: AgentProviderKind;
  label: string;
  privateNetworkAccess: "confirmed" | "not-required";
  version: number;
}>;

export type AgentCodexProfileParameters = Readonly<{
  kind: "codex";
  maxInputCharacters: number;
  maxOutputCharacters: number;
  reasoningEffort: "high" | "low" | "medium" | "xhigh";
}>;

export type AgentChatProfileParameters = Readonly<{
  historyBudgetCharacters: number;
  kind: "chat";
  maxOutputTokens: number;
  maxToolSteps: number;
  reasoningEffort: AgentChatReasoningEffort;
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

export type AgentProviderInput = Readonly<{
  apiKey?: string | null;
  authenticationType: "bearer" | "none";
  baseUrl: string | null;
  kind: AgentProviderKind;
  label: string;
  privateNetworkAccessConfirmed: boolean;
}>;

export type AgentProfileInput = Readonly<{
  label: string;
  maxResidentSessions: number;
  model: string;
  parameters: AgentProfileParameters;
  providerId: string;
  timeoutMilliseconds: number;
}>;

export type AgentOllamaDiscovery = Readonly<{
  endpoint: string;
  models: readonly string[];
}>;

export type AgentOllamaResidentContext =
  | Readonly<{
      allocatedContextTokens: number;
      status: "loaded";
    }>
  | Readonly<{ status: "loaded-unreported" }>
  | Readonly<{ status: "not-loaded" }>;

export type AgentProviderProbe = Readonly<{
  modelContexts: readonly Readonly<{
    declaredMaximumContextTokens: number | null;
    model: string;
    residentContext: AgentOllamaResidentContext;
  }>[];
  models: readonly string[];
  probedAt: string;
  reachable: boolean;
}>;

export type AgentConformanceCheckStatus = Readonly<{
  completedAt: string | null;
  errorMessage: string | null;
  id: string;
  phase: "calling-tool" | "recording-result" | "summarizing";
  profileId: string;
  startedAt: string;
  status: "cancelled" | "failed" | "running" | "succeeded";
}>;
