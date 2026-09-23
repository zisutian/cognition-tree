// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProfileConformance,
  AgentProfileParameters,
  AgentProviderKind,
} from "./agentConfiguration.ts";

export const agentConfigurationFormatVersion = 5;

export type AgentCredentialReference = Readonly<{
  digest: `sha256:${string}`;
  reference: string;
  version: number;
}>;

export type StoredAuthentication =
  | { credential: AgentCredentialReference | null; type: "api-key" }
  | { credential: AgentCredentialReference | null; type: "chatgpt-device-code" }
  | { type: "none" };

export type StoredProvider = {
  authentication: StoredAuthentication;
  baseUrl: string | null;
  id: string;
  kind: AgentProviderKind;
  label: string;
  privateNetworkOrigin: string | null;
  version: number;
};

export type StoredProfile = {
  conformance: AgentProfileConformance | null;
  id: string;
  label: string;
  maxResidentSessions: number;
  model: string;
  parameters: AgentProfileParameters;
  providerId: string;
  timeoutMilliseconds: number;
  version: number;
};

export type AgentConfigurationState = {
  formatVersion: typeof agentConfigurationFormatVersion;
  profiles: StoredProfile[];
  providers: StoredProvider[];
};

export function validateAgentConfigurationRelationships(state: AgentConfigurationState) {
  const providerIds = new Set<string>();
  const profileIds = new Set<string>();

  for (const provider of state.providers) {
    if (providerIds.has(provider.id)) throw new Error("Provider id is duplicated.");
    providerIds.add(provider.id);
  }
  for (const profile of state.profiles) {
    if (profileIds.has(profile.id)) throw new Error("Profile id is duplicated.");
    profileIds.add(profile.id);
    const provider = state.providers.find(({id}) => id === profile.providerId);
    if (!provider) throw new Error(`Profile provider does not exist: ${profile.providerId}`);
    if ((provider.kind === "codex") !== (profile.parameters.kind === "codex")) {
      throw new Error("Profile parameters do not match provider kind.");
    }
    if (provider.kind !== "ollama" && profile.parameters.kind === "chat" &&
        profile.parameters.toolCallMode === "single-json") {
      throw new Error("single-json is only valid for Ollama profiles.");
    }
  }
}
