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
  dispose(): void;
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
  const codexDeviceLoginOperations = new Map<string, symbol>();
  const conformanceOperations = new Map<string, symbol>();
  let configurationAuthorityVersion = 0;
  let disposed = false;
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
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const requireActive = () => {
    if (disposed) {
      throw new Error("Agent configuration controller is disposed.");
    }
  };
  const requireRevision = () => {
    if (!state.configuration) throw new Error("Agent configuration is not loaded.");
    return state.configuration.revision;
  };
  const beginResourceOperation = (
    operations: Map<string, symbol>,
    resourceId: string,
  ) => {
    const token = Symbol(resourceId);

    operations.set(resourceId, token);
    return token;
  };
  const resourceOperationIsCurrent = (
    operations: Map<string, symbol>,
    resourceId: string,
    token: symbol,
  ) => !disposed && operations.get(resourceId) === token;
  const finishResourceOperation = (
    operations: Map<string, symbol>,
    resourceId: string,
    token: symbol,
  ) => {
    if (operations.get(resourceId) === token) operations.delete(resourceId);
  };
  const installConfiguration = (configuration: AgentConfigurationSnapshot) => {
    const previousProviderDigests = new Map(
      state.configuration?.providers.map(({ digest, id }) => [id, digest]) ?? [],
    );
    const previousProfileDigests = new Map(
      state.configuration?.profiles.map(({ digest, id }) => [id, digest]) ?? [],
    );
    const currentProviderIds = new Set(
      configuration.providers
        .filter(({ digest, id }) =>
          !previousProviderDigests.has(id) ||
          previousProviderDigests.get(id) === digest
        )
        .map(({ id }) => id),
    );
    const currentProfileIds = new Set(
      configuration.profiles
        .filter(({ digest, id }) =>
          !previousProfileDigests.has(id) ||
          previousProfileDigests.get(id) === digest
        )
        .map(({ id }) => id),
    );

    for (const providerId of codexDeviceLoginOperations.keys()) {
      if (!currentProviderIds.has(providerId)) {
        codexDeviceLoginOperations.delete(providerId);
      }
    }
    for (const profileId of conformanceOperations.keys()) {
      if (!currentProfileIds.has(profileId)) {
        conformanceOperations.delete(profileId);
      }
    }
    configurationAuthorityVersion += 1;
    publish({
      codexDeviceLogins: Object.fromEntries(
        Object.entries(state.codexDeviceLogins).filter(([providerId]) =>
          currentProviderIds.has(providerId)
        ),
      ),
      configuration,
      conformanceChecks: Object.fromEntries(
        Object.entries(state.conformanceChecks).filter(([profileId]) =>
          currentProfileIds.has(profileId)
        ),
      ),
      loadStatus: "ready",
      probes: Object.fromEntries(
        Object.entries(state.probes).filter(([providerId]) =>
          currentProviderIds.has(providerId)
        ),
      ),
    });
  };
  const refreshConfiguration = async (isCurrent = () => true) => {
    const expectedAuthorityVersion = configurationAuthorityVersion;
    const configuration = await port.load();

    if (
      configurationAuthorityVersion !== expectedAuthorityVersion ||
      !isCurrent()
    ) {
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
    requireActive();
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

      if (disposed) return;
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
      requireActive();
      const login = state.codexDeviceLogins[providerId];

      if (!login || login.status !== "pending") return;
      await runOperation(async () => {
        const expectedToken = codexDeviceLoginOperations.get(providerId);

        if (!expectedToken) return;
        const cancelled = await port.cancelCodexDeviceLogin(login.id);

        if (!resourceOperationIsCurrent(
          codexDeviceLoginOperations,
          providerId,
          expectedToken,
        )) return;
        const currentLogin = state.codexDeviceLogins[providerId];

        if (
          currentLogin?.id === cancelled.id &&
          currentLogin.status !== "pending"
        ) return;
        const token = cancelled.status === "pending"
          ? expectedToken
          : beginResourceOperation(
            codexDeviceLoginOperations,
            providerId,
          );
        const isCurrent = () => resourceOperationIsCurrent(
          codexDeviceLoginOperations,
          providerId,
          token,
        );

        try {
          publishCodexDeviceLogin(cancelled);
          if (cancelled.status === "succeeded") {
            if (await refreshConfiguration(isCurrent)) {
              await onConfigurationChanged();
            }
          } else if (cancelled.status === "failed") {
            publish({
              errorMessage: cancelled.errorMessage ??
                "Codex device login failed.",
            });
          }
        } finally {
          if (cancelled.status !== "pending") {
            finishResourceOperation(
              codexDeviceLoginOperations,
              providerId,
              token,
            );
          }
        }
      });
    },
    async cancelConformance(profileId) {
      requireActive();
      const check = state.conformanceChecks[profileId];

      if (!check || check.status !== "running") return;
      await runOperation(async () => {
        const expectedToken = conformanceOperations.get(profileId);

        if (!expectedToken) return;
        const cancelled = await port.cancelConformance(check.id);

        if (!resourceOperationIsCurrent(
          conformanceOperations,
          profileId,
          expectedToken,
        )) return;
        const currentCheck = state.conformanceChecks[profileId];

        if (
          currentCheck?.id === cancelled.id &&
          currentCheck.status !== "running"
        ) return;
        const token = cancelled.status === "running"
          ? expectedToken
          : beginResourceOperation(conformanceOperations, profileId);
        const isCurrent = () => resourceOperationIsCurrent(
          conformanceOperations,
          profileId,
          token,
        );

        try {
          publishConformance(cancelled);
          if (cancelled.status === "succeeded") {
            if (await refreshConfiguration(isCurrent)) {
              await onConfigurationChanged();
            }
          } else if (cancelled.status === "failed") {
            publish({
              errorMessage: cancelled.errorMessage ??
                "Agent conformance check failed.",
            });
          }
        } finally {
          if (cancelled.status !== "running") {
            finishResourceOperation(conformanceOperations, profileId, token);
          }
        }
      });
    },
    async checkConformance(profileId) {
      await runOperation(async () => {
        const token = beginResourceOperation(
          conformanceOperations,
          profileId,
        );
        const isCurrent = () => resourceOperationIsCurrent(
          conformanceOperations,
          profileId,
          token,
        );

        try {
          let check: AgentConformanceCheckStatus;

          try {
            check = await port.startConformance(
              requireRevision(),
              profileId,
            );
            if (!isCurrent()) return;

            publishConformance(check);
            while (check.status === "running") {
              await pollConformance(pollConformanceIntervalMilliseconds);
              if (!isCurrent()) return;
              const polled = await port.getConformance(check.id);

              if (!isCurrent()) return;
              check = polled;
              publishConformance(check);
            }
          } catch (error) {
            if (!isCurrent()) return;
            throw error;
          }
          if (check.status === "failed") {
            throw new Error(
              check.errorMessage ?? "Agent conformance check failed.",
            );
          }
          if (check.status === "cancelled") return;
          if (await refreshConfiguration(isCurrent)) {
            await onConfigurationChanged();
          }
        } finally {
          finishResourceOperation(conformanceOperations, profileId, token);
        }
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
    dispose() {
      if (disposed) return;
      disposed = true;
      loadRequestVersion += 1;
      codexDeviceLoginOperations.clear();
      conformanceOperations.clear();
      listeners.clear();
    },
    async discoverOllama(endpoint) {
      await runOperation(async () => {
        const discovery = await port.discoverOllama(endpoint);

        if (disposed) return;
        publish({ discovery });
      });
    },
    getSnapshot: () => state,
    async load() {
      requireActive();
      const requestVersion = ++loadRequestVersion;
      const expectedAuthorityVersion = configurationAuthorityVersion;

      publish({ errorMessage: null, loadStatus: "loading" });
      try {
        const configuration = await port.load();

        if (
          disposed ||
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        installConfiguration(configuration);
      } catch (error) {
        if (
          disposed ||
          requestVersion !== loadRequestVersion ||
          expectedAuthorityVersion !== configurationAuthorityVersion
        ) return;
        publish({ errorMessage: message(error), loadStatus: "failed" });
      }
    },
    async probeProvider(providerId) {
      await runOperation(async () => {
        const expectedDigest = state.configuration?.providers.find(
          ({ id }) => id === providerId,
        )?.digest;

        if (!expectedDigest) {
          throw new Error(`Agent provider does not exist: ${providerId}`);
        }
        const probe = await port.probeProvider(providerId);
        const currentDigest = state.configuration?.providers.find(
          ({ id }) => id === providerId,
        )?.digest;

        if (disposed || currentDigest !== expectedDigest) return;
        publish({
          probes: { ...state.probes, [providerId]: probe },
        });
      });
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async startCodexDeviceLogin(providerId) {
      await runOperation(async () => {
        const token = beginResourceOperation(
          codexDeviceLoginOperations,
          providerId,
        );
        const isCurrent = () => resourceOperationIsCurrent(
          codexDeviceLoginOperations,
          providerId,
          token,
        );
        let login: AgentCodexDeviceLoginStatus;

        try {
          login = await port.startCodexDeviceLogin(
            requireRevision(),
            providerId,
          );
        } catch (error) {
          finishResourceOperation(
            codexDeviceLoginOperations,
            providerId,
            token,
          );
          throw error;
        }
        if (!isCurrent()) {
          finishResourceOperation(
            codexDeviceLoginOperations,
            providerId,
            token,
          );
          return;
        }
        publishCodexDeviceLogin(login);
        void (async () => {
          try {
            let current = login;

            while (current.status === "pending") {
              await pollConformance(pollConformanceIntervalMilliseconds);
              if (!isCurrent()) return;
              const polled = await port.getCodexDeviceLogin(current.id);

              if (!isCurrent()) return;
              current = polled;
              publishCodexDeviceLogin(current);
            }
            if (current.status === "succeeded") {
              if (await refreshConfiguration(isCurrent)) {
                await onConfigurationChanged();
              }
            } else if (current.status === "failed") {
              publish({
                errorMessage: current.errorMessage ?? "Codex device login failed.",
              });
            }
          } catch (error) {
            if (isCurrent()) publish({ errorMessage: message(error) });
          } finally {
            finishResourceOperation(
              codexDeviceLoginOperations,
              providerId,
              token,
            );
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
