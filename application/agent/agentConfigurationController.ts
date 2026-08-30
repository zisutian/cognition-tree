// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConformanceCheckStatus,
  AgentCodexDeviceLoginStatus,
  AgentConfigurationSnapshot,
  AgentOllamaDiscovery,
  AgentProfileInput,
  AgentProviderInput,
  AgentProviderProbe,
} from "./agentConfiguration.ts";

export type AgentConfigurationPort = {
  cancelCodexDeviceLogin(loginId: string): Promise<AgentCodexDeviceLoginStatus>;
  cancelConformance(checkId: string): Promise<AgentConformanceCheckStatus>;
  clearProviderAuthentication(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentConfigurationSnapshot>;
  getConformance(checkId: string): Promise<AgentConformanceCheckStatus>;
  getCodexDeviceLogin(loginId: string): Promise<AgentCodexDeviceLoginStatus>;
  startCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentCodexDeviceLoginStatus>;
  startConformance(
    baseRevision: string,
    profileId: string,
  ): Promise<AgentConformanceCheckStatus>;
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
  codexDeviceLogins: Readonly<Record<string, AgentCodexDeviceLoginStatus>>;
  conformanceChecks: Readonly<Record<string, AgentConformanceCheckStatus>>;
  configuration: AgentConfigurationSnapshot | null;
  discovery: AgentOllamaDiscovery | null;
  errorMessage: string | null;
  loadStatus: "idle" | "loading" | "ready" | "failed";
  operationStatus: "idle" | "working";
  probes: Readonly<Record<string, AgentProviderProbe>>;
}>;

export type AgentConfigurationController = {
  cancelCodexDeviceLogin(providerId: string): Promise<void>;
  cancelConformance(profileId: string): Promise<void>;
  checkConformance(profileId: string): Promise<void>;
  clearProviderAuthentication(providerId: string): Promise<void>;
  createProfile(profile: AgentProfileInput): Promise<void>;
  createProvider(provider: AgentProviderInput): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
  deleteProvider(providerId: string): Promise<void>;
  discoverOllama(endpoint: string): Promise<void>;
  getSnapshot(): AgentConfigurationState;
  load(): Promise<void>;
  probeProvider(providerId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  startCodexDeviceLogin(providerId: string): Promise<void>;
  updateProfile(profileId: string, profile: AgentProfileInput): Promise<void>;
  updateProvider(providerId: string, provider: AgentProviderInput): Promise<void>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "Agent configuration failed.";
}

export function createAgentConfigurationController({
  onConfigurationChanged,
  pollConformance,
  pollConformanceIntervalMilliseconds,
  port,
}: {
  onConfigurationChanged(): Promise<void> | void;
  pollConformance(milliseconds: number): Promise<void>;
  pollConformanceIntervalMilliseconds: number;
  port: AgentConfigurationPort;
}): AgentConfigurationController {
  const listeners = new Set<() => void>();
  let configurationAuthorityVersion = 0;
  let loadRequestVersion = 0;
  let operationCount = 0;
  let state: AgentConfigurationState = {
    codexDeviceLogins: {},
    conformanceChecks: {},
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
  const installConfiguration = (configuration: AgentConfigurationSnapshot) => {
    configurationAuthorityVersion += 1;
    publish({
      configuration,
      loadStatus: "ready",
    });
  };
  const refreshConfiguration = async () => {
    const expectedAuthorityVersion = configurationAuthorityVersion;
    const configuration = await port.load();

    if (configurationAuthorityVersion !== expectedAuthorityVersion) {
      return false;
    }
    installConfiguration(configuration);
    return true;
  };
  const publishConformance = (check: AgentConformanceCheckStatus) => {
    publish({
      conformanceChecks: {
        ...state.conformanceChecks,
        [check.profileId]: check,
      },
    });
  };
  const publishCodexDeviceLogin = (login: AgentCodexDeviceLoginStatus) => {
    publish({
      codexDeviceLogins: {
        ...state.codexDeviceLogins,
        [login.providerId]: login,
      },
    });
  };
  const runOperation = async <Result>(operation: () => Promise<Result>) => {
    operationCount += 1;
    publish({ errorMessage: null, operationStatus: "working" });
    try {
      return await operation();
    } catch (error) {
      publish({ errorMessage: message(error) });
      throw error;
    } finally {
      operationCount -= 1;
      publish({ operationStatus: operationCount > 0 ? "working" : "idle" });
    }
  };
  const mutate = (
    operation: (revision: string) => Promise<AgentConfigurationSnapshot>,
  ) =>
    runOperation(async () => {
      const baseRevision = requireRevision();
      const configuration = await operation(baseRevision);
      const currentRevision = state.configuration?.revision ?? null;

      if (
        currentRevision === baseRevision ||
        currentRevision === configuration.revision
      ) {
        installConfiguration(configuration);
      }
      await onConfigurationChanged();
    });

  return {
    async cancelCodexDeviceLogin(providerId) {
      const login = state.codexDeviceLogins[providerId];

      if (!login || login.status !== "pending") return;
      await runOperation(async () => {
        publishCodexDeviceLogin(await port.cancelCodexDeviceLogin(login.id));
      });
    },
    async cancelConformance(profileId) {
      const check = state.conformanceChecks[profileId];

      if (!check || check.status !== "running") return;
      await runOperation(async () => {
        publishConformance(await port.cancelConformance(check.id));
      });
    },
    async checkConformance(profileId) {
      await runOperation(async () => {
        let check = await port.startConformance(
          requireRevision(),
          profileId,
        );

        publishConformance(check);
        while (check.status === "running") {
          await pollConformance(pollConformanceIntervalMilliseconds);
          check = await port.getConformance(check.id);
          publishConformance(check);
        }
        if (check.status === "failed") {
          throw new Error(check.errorMessage ?? "Agent conformance check failed.");
        }
        if (check.status === "cancelled") {
          return;
        }
        await refreshConfiguration();
        await onConfigurationChanged();
      });
    },
    clearProviderAuthentication: (providerId) => mutate((revision) =>
      port.clearProviderAuthentication(revision, providerId)
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
      await runOperation(async () => {
        const discovery = await port.discoverOllama(endpoint);

        publish({ discovery });
      });
    },
    getSnapshot: () => state,
    async load() {
      const requestVersion = ++loadRequestVersion;
      const expectedAuthorityVersion = configurationAuthorityVersion;

      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        const configuration = await port.load();

        if (
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        installConfiguration(configuration);
      } catch (error) {
        if (
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        publish({ errorMessage: message(error), loadStatus: "failed" });
      }
    },
    async probeProvider(providerId) {
      await runOperation(async () => {
        const probe = await port.probeProvider(providerId);

        publish({
          probes: { ...state.probes, [providerId]: probe },
        });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async startCodexDeviceLogin(providerId) {
      await runOperation(async () => {
        const login = await port.startCodexDeviceLogin(
          requireRevision(),
          providerId,
        );

        publishCodexDeviceLogin(login);
        void (async () => {
          try {
            let current = login;

            while (current.status === "pending") {
              await pollConformance(pollConformanceIntervalMilliseconds);
              current = await port.getCodexDeviceLogin(current.id);
              publishCodexDeviceLogin(current);
            }
            if (current.status === "succeeded") {
              await refreshConfiguration();
              await onConfigurationChanged();
            } else if (current.status === "failed") {
              publish({
                errorMessage: current.errorMessage ?? "Codex device login failed.",
              });
            }
          } catch (error) {
            publish({ errorMessage: message(error) });
          }
        })();
      });
    },
    updateProfile: (profileId, profile) => mutate((revision) =>
      port.updateProfile(revision, profileId, profile)
    ),
    updateProvider: (providerId, provider) => mutate((revision) =>
      port.updateProvider(revision, providerId, provider)
    ),
  };
}
