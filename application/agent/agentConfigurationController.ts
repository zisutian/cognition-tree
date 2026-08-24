// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationSnapshot,
  AgentOllamaDiscovery,
  AgentProfileInput,
  AgentProviderInput,
  AgentProviderProbe,
} from "./agentConfiguration.ts";

export type AgentConfigurationPort = {
  checkConformance(
    baseRevision: string,
    profileId: string,
  ): Promise<AgentConfigurationSnapshot>;
  createProfile(
    baseRevision: string,
    profile: AgentProfileInput,
  ): Promise<AgentConfigurationSnapshot>;
  createProvider(
    baseRevision: string,
    provider: AgentProviderInput,
  ): Promise<AgentConfigurationSnapshot>;
  deleteProfile(
    baseRevision: string,
    profileId: string,
  ): Promise<AgentConfigurationSnapshot>;
  deleteProvider(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentConfigurationSnapshot>;
  discoverOllama(endpoint: string): Promise<AgentOllamaDiscovery>;
  load(): Promise<AgentConfigurationSnapshot>;
  probeProvider(providerId: string): Promise<AgentProviderProbe>;
  updateProfile(
    baseRevision: string,
    profileId: string,
    profile: AgentProfileInput,
  ): Promise<AgentConfigurationSnapshot>;
  updateProvider(
    baseRevision: string,
    providerId: string,
    provider: AgentProviderInput,
  ): Promise<AgentConfigurationSnapshot>;
};

export type AgentConfigurationState = Readonly<{
  configuration: AgentConfigurationSnapshot | null;
  discovery: AgentOllamaDiscovery | null;
  errorMessage: string | null;
  loadStatus: "idle" | "loading" | "ready" | "failed";
  operationStatus: "idle" | "working";
  probes: Readonly<Record<string, AgentProviderProbe>>;
}>;

export type AgentConfigurationController = {
  checkConformance(profileId: string): Promise<void>;
  createProfile(profile: AgentProfileInput): Promise<void>;
  createProvider(provider: AgentProviderInput): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
  deleteProvider(providerId: string): Promise<void>;
  discoverOllama(endpoint: string): Promise<void>;
  getSnapshot(): AgentConfigurationState;
  load(): Promise<void>;
  probeProvider(providerId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  updateProfile(profileId: string, profile: AgentProfileInput): Promise<void>;
  updateProvider(providerId: string, provider: AgentProviderInput): Promise<void>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "Agent configuration failed.";
}

export function createAgentConfigurationController({
  onConfigurationChanged,
  port,
}: {
  onConfigurationChanged(): Promise<void> | void;
  port: AgentConfigurationPort;
}): AgentConfigurationController {
  const listeners = new Set<() => void>();
  let state: AgentConfigurationState = {
    configuration: null,
    discovery: null,
    errorMessage: null,
    loadStatus: "idle",
    operationStatus: "idle",
    probes: {},
  };
  const publish = (patch: Partial<AgentConfigurationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const requireRevision = () => {
    if (!state.configuration) throw new Error("Agent configuration is not loaded.");
    return state.configuration.revision;
  };
  const mutate = async (
    operation: (revision: string) => Promise<AgentConfigurationSnapshot>,
  ) => {
    publish({ errorMessage: null, operationStatus: "working" });
    try {
      const configuration = await operation(requireRevision());

      publish({ configuration, operationStatus: "idle" });
      await onConfigurationChanged();
    } catch (error) {
      publish({ errorMessage: message(error), operationStatus: "idle" });
      throw error;
    }
  };

  return {
    checkConformance: (profileId) => mutate((revision) =>
      port.checkConformance(revision, profileId)
    ),
    createProfile: (profile) => mutate((revision) =>
      port.createProfile(revision, profile)
    ),
    createProvider: (provider) => mutate((revision) =>
      port.createProvider(revision, provider)
    ),
    deleteProfile: (profileId) => mutate((revision) =>
      port.deleteProfile(revision, profileId)
    ),
    deleteProvider: (providerId) => mutate((revision) =>
      port.deleteProvider(revision, providerId)
    ),
    async discoverOllama(endpoint) {
      publish({ errorMessage: null, operationStatus: "working" });
      try {
        const discovery = await port.discoverOllama(endpoint);

        publish({ discovery, operationStatus: "idle" });
      } catch (error) {
        publish({ errorMessage: message(error), operationStatus: "idle" });
        throw error;
      }
    },
    getSnapshot: () => state,
    async load() {
      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        publish({ configuration: await port.load(), loadStatus: "ready" });
      } catch (error) {
        publish({ errorMessage: message(error), loadStatus: "failed" });
      }
    },
    async probeProvider(providerId) {
      publish({ errorMessage: null, operationStatus: "working" });
      try {
        const probe = await port.probeProvider(providerId);

        publish({
          operationStatus: "idle",
          probes: { ...state.probes, [providerId]: probe },
        });
      } catch (error) {
        publish({ errorMessage: message(error), operationStatus: "idle" });
        throw error;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateProfile: (profileId, profile) => mutate((revision) =>
      port.updateProfile(revision, profileId, profile)
    ),
    updateProvider: (providerId, provider) => mutate((revision) =>
      port.updateProvider(revision, providerId, provider)
    ),
  };
}
