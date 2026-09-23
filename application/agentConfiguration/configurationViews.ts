// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationSnapshot,
  AgentProfileView,
  AgentProviderView,
} from "./agentConfiguration.ts";
import type {
  AgentConfigurationState,
  StoredProfile,
  StoredProvider,
} from "./configurationState.ts";
import { requireAgentConfigurationProvider } from "./configurationStateLookup.ts";

export function createAgentConfigurationViews(
  digest: (value: unknown) => `sha256:${string}`,
  contractVersions: {conformance: number; tool: number},
) {

function stateRevision(state: AgentConfigurationState) {
  return digest(state);
}

function providerDigest(provider: StoredProvider) {
  return digest(provider);
}

function profileDigest(profile: StoredProfile) {
  const { conformance: _conformance, ...configuration } = profile;

  return digest({
    agentConformanceContractVersion: contractVersions.conformance,
    agentToolContractVersion: contractVersions.tool,
    configuration,
  });
}

function providerView(provider: StoredProvider): AgentProviderView {
  return {
    authenticationStatus: provider.authentication.type === "none"
      ? "not-required"
      : provider.authentication.credential
        ? "configured"
        : "missing",
    authenticationType: provider.authentication.type,
    baseUrl: provider.baseUrl,
    digest: providerDigest(provider),
    id: provider.id,
    kind: provider.kind,
    label: provider.label,
    privateNetworkAccess: provider.privateNetworkOrigin
      ? "confirmed"
      : "not-required",
    version: provider.version,
  };
}

function profileView(
  profile: StoredProfile,
  provider: StoredProvider,
): AgentProfileView {
  const currentProfileDigest = profileDigest(profile);
  const currentProviderDigest = providerDigest(provider);
  const authenticationMissing = provider.authentication.type !== "none" &&
    !provider.authentication.credential;
  const requiresConformance = provider.kind !== "codex";
  const conformanceCurrent = profile.conformance !== null &&
    profile.conformance.profileDigest === currentProfileDigest &&
    profile.conformance.providerDigest === currentProviderDigest &&
    profile.parameters.kind === "chat" &&
    profile.conformance.toolCallMode === profile.parameters.toolCallMode;
  const toolStepLimitTooSmall = profile.parameters.kind === "chat" &&
    profile.parameters.maxToolSteps < 3;
  const unavailableReason = authenticationMissing
    ? "Provider authentication is missing"
    : toolStepLimitTooSmall
      ? "Chat profiles require at least 3 tool steps"
      : requiresConformance && !conformanceCurrent
        ? "Tool-call conformance has not been verified"
        : null;

  return {
    availability: unavailableReason === null ? "available" : "unavailable",
    conformance: profile.conformance,
    digest: currentProfileDigest,
    id: profile.id,
    label: profile.label,
    maxResidentSessions: profile.maxResidentSessions,
    model: profile.model,
    parameters: structuredClone(profile.parameters),
    providerId: profile.providerId,
    timeoutMilliseconds: profile.timeoutMilliseconds,
    unavailableReason,
    version: profile.version,
  };
}

function configurationSnapshot(
  state: AgentConfigurationState,
): AgentConfigurationSnapshot {
  return {
    profiles: state.profiles.map((profile) =>
      profileView(
        profile,
        requireAgentConfigurationProvider(state, profile.providerId),
      )
    ),
    providers: state.providers.map(providerView),
    revision: stateRevision(state),
  };
}

  return {
    configurationSnapshot,
    profileDigest,
    profileView,
    providerDigest,
    providerView,
    stateRevision,
  };
}

export type AgentConfigurationViews = ReturnType<typeof createAgentConfigurationViews>;
