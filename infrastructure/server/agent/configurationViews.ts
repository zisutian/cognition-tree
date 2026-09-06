// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationSnapshot,
  AgentProfileView,
  AgentProviderView,
} from "../../../application/agent/index.ts";
import {
  agentConformanceContractVersion,
  agentToolContractVersion,
} from "../../../contracts/agent/index.ts";

import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import { createStateDigest } from "../state/index.ts";
import type {
  AgentConfigurationState,
  StoredProfile,
  StoredProvider,
} from "./configurationStateCodec.ts";
import { requireAgentConfigurationProvider } from "./configurationStateLookup.ts";

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createStateDigest(serializeJsonIteratively(value, {
    sortObjectKeys: true,
  }))}`;
}

export function stateRevision(state: AgentConfigurationState) {
  return digest(state);
}

export function providerDigest(provider: StoredProvider) {
  return digest(provider);
}

export function profileDigest(profile: StoredProfile) {
  const { conformance: _conformance, ...configuration } = profile;

  return digest({
    agentConformanceContractVersion,
    agentToolContractVersion,
    configuration,
  });
}

export function providerView(provider: StoredProvider): AgentProviderView {
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

export function profileView(
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

export function configurationSnapshot(
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
