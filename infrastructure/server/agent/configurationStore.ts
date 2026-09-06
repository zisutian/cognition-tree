// SPDX-License-Identifier: GPL-3.0-or-later

import type { ResolvedAgentConfiguration, ResolvedAgentProvider } from '../../../application/agentHost/index.ts';
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentProfileInput,
  AgentProviderInput,
  AgentToolCallMode,
} from "../../../application/agent/index.ts";
import {
  SecureJsonPartition,
  type SecureStateFileReplacer,
} from "../state/index.ts";
import {
  AgentConfigurationAccess,
  type AgentConfigurationProfileUse,
  type AgentConfigurationProviderChange,
  type AgentConfigurationProviderUse,
} from "../../../application/agentHost/index.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import {
  AgentProviderCredentialStore,
} from "./providerCredentialStore.ts";
import {
  createInitialAgentConfigurationState,
  materializeLegacyAgentConfigurationState,
  parseAgentConfigurationState,
  type AgentConfigurationState,
} from "./configurationStateCodec.ts";
import {
  configurationSnapshot,
  profileView,
  providerView,
} from "./configurationViews.ts";
import { requireAgentConfigurationProvider } from "./configurationStateLookup.ts";
import { AgentProfileConfiguration } from "./profileConfiguration.ts";
import { AgentProviderConfiguration } from "./providerConfiguration.ts";

export class AgentConfigurationStore {
  readonly access = new AgentConfigurationAccess();
  readonly #credentialStore: AgentProviderCredentialStore;
  #initialize: Promise<void> | null = null;
  readonly #partition: SecureJsonPartition<AgentConfigurationState>;
  readonly #profiles: AgentProfileConfiguration;
  readonly #providers: AgentProviderConfiguration;

  constructor(
    stateDirectory: string,
    {
      createId = randomUUID,
      replaceConfigurationFile,
      targetPolicy = new AgentProviderTargetPolicy(),
    }: {
      createId?: () => string;
      replaceConfigurationFile?: SecureStateFileReplacer;
      targetPolicy?: AgentProviderTargetPolicy;
    } = {},
  ) {
    this.#credentialStore = new AgentProviderCredentialStore(stateDirectory);
    this.#partition = new SecureJsonPartition<AgentConfigurationState>({
      createInitial: createInitialAgentConfigurationState,
      directory: path.join(path.resolve(stateDirectory), "agent-config-v1"),
      fileName: "configuration.json",
      name: "Agent configuration",
      parse: parseAgentConfigurationState,
      ...(replaceConfigurationFile
        ? { replaceFile: replaceConfigurationFile }
        : {}),
    });
    this.#profiles = new AgentProfileConfiguration({
      access: this.access,
      createId,
      mutate: (operation) => this.#mutate(operation),
    });
    this.#providers = new AgentProviderConfiguration({
      access: this.access,
      createId,
      credentialStore: this.#credentialStore,
      mutate: (operation) => this.#mutate(operation),
      read: (project) => this.#read(project),
      targetPolicy,
    });
  }

  readSnapshot() {
    return this.#read(configurationSnapshot);
  }

  async resolveProfile(
    profileId: string,
    use: AgentConfigurationProfileUse | null = null,
  ): Promise<ResolvedAgentConfiguration | null> {
    const activeUse = use ?? this.access.beginProfileUse(profileId);

    try {
      const resolved = await this.#read((state) => {
        const storedProfile = state.profiles.find(({ id }) => id === profileId);

        if (!storedProfile) return null;
        const storedProvider = requireAgentConfigurationProvider(
          state,
          storedProfile.providerId,
        );

        activeUse.bindProvider(storedProvider.id);
        return {
          authentication: storedProvider.authentication,
          privateNetworkOrigin: storedProvider.privateNetworkOrigin,
          profile: profileView(storedProfile, storedProvider),
          provider: providerView(storedProvider),
        };
      });

      if (!resolved) return null;
      const credential = resolved.authentication.type === "none"
        ? null
        : resolved.authentication.credential;
      return {
        apiKey: credential && resolved.authentication.type === "api-key"
          ? await this.#credentialStore.readApiKey(credential)
          : null,
        codexHome: credential &&
            resolved.authentication.type === "chatgpt-device-code"
          ? await this.#credentialStore.resolveCodexManagedHome(credential)
          : null,
        privateNetworkOrigin: resolved.privateNetworkOrigin,
        profile: resolved.profile,
        provider: resolved.provider,
      };
    } finally {
      if (!use) activeUse.release();
    }
  }

  async resolveProvider(
    providerId: string,
    use: AgentConfigurationProviderUse | null = null,
  ): Promise<ResolvedAgentProvider | null> {
    const activeUse = use ?? this.access.beginProviderUse(providerId);

    try {
      const resolved = await this.#read((state) => {
        const storedProvider = state.providers.find(({ id }) => id === providerId);

        if (!storedProvider) return null;
        return {
          authentication: storedProvider.authentication,
          privateNetworkOrigin: storedProvider.privateNetworkOrigin,
          provider: providerView(storedProvider),
        };
      });

      if (!resolved) return null;
      const credential = resolved.authentication.type === "none"
        ? null
        : resolved.authentication.credential;
      return {
        apiKey: credential && resolved.authentication.type === "api-key"
          ? await this.#credentialStore.readApiKey(credential)
          : null,
        codexHome: credential &&
            resolved.authentication.type === "chatgpt-device-code"
          ? await this.#credentialStore.resolveCodexManagedHome(credential)
          : null,
        privateNetworkOrigin: resolved.privateNetworkOrigin,
        provider: resolved.provider,
      };
    } finally {
      if (!use) activeUse.release();
    }
  }

  async createProvider(baseRevision: string, input: AgentProviderInput) {
    return await this.#providers.create(baseRevision, input);
  }

  async updateProvider(
    baseRevision: string,
    providerId: string,
    input: AgentProviderInput,
  ) {
    return await this.#providers.update(baseRevision, providerId, input);
  }

  async deleteProvider(baseRevision: string, providerId: string) {
    return await this.#providers.delete(baseRevision, providerId);
  }

  reserveProviderChange(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentConfigurationProviderChange> {
    return this.#providers.reserveChange(baseRevision, providerId);
  }

  async prepareCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    loginId: string,
    change: AgentConfigurationProviderChange | null = null,
  ) {
    return await this.#providers.prepareCodexDeviceLogin(
      baseRevision,
      providerId,
      loginId,
      change,
    );
  }

  removeCodexDeviceLoginStaging(
    providerId: string,
    credentialVersion: number,
    loginId: string,
  ) {
    return this.#providers.removeCodexDeviceLoginStaging(
      providerId,
      credentialVersion,
      loginId,
    );
  }

  async completeCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    credentialVersion: number,
    loginId: string,
    reservedChange: AgentConfigurationProviderChange | null = null,
  ) {
    return await this.#providers.completeCodexDeviceLogin(
      baseRevision,
      providerId,
      credentialVersion,
      loginId,
      reservedChange,
    );
  }

  async clearProviderAuthentication(
    baseRevision: string,
    providerId: string,
  ) {
    return await this.#providers.clearAuthentication(baseRevision, providerId);
  }

  createProfile(
    baseRevision: string,
    input: AgentProfileInput,
  ) {
    return this.#profiles.create(baseRevision, input);
  }

  updateProfile(
    baseRevision: string,
    profileId: string,
    input: AgentProfileInput,
  ) {
    return this.#profiles.update(baseRevision, profileId, input);
  }

  deleteProfile(baseRevision: string, profileId: string) {
    return this.#profiles.delete(baseRevision, profileId);
  }

  setConformance(
    baseRevision: string,
    profileId: string,
    input: {
      checkedAt: string;
      toolCallMode: AgentToolCallMode;
    },
  ) {
    return this.#profiles.setConformance(baseRevision, profileId, input);
  }

  #mutate<Result>(
    operation: (
      state: AgentConfigurationState,
    ) => { changed: boolean; result: Result } | Promise<{
      changed: boolean;
      result: Result;
    }>,
  ) {
    return this.#ensureInitialized().then(() =>
      this.#partition.mutate(operation)
    );
  }

  #read<Result>(project: (state: AgentConfigurationState) => Result) {
    return this.#ensureInitialized().then(() => this.#partition.read(project));
  }

  #ensureInitialized() {
    this.#initialize ??= this.#partition.mutate(async (state) => {
      const changed = await materializeLegacyAgentConfigurationState(
        state,
        (providerId, apiKey, version) =>
          this.#credentialStore.writeApiKey(providerId, apiKey, version),
      );
      await this.#credentialStore.reconcile(state.providers.flatMap((provider) =>
        provider.authentication.type !== "none" &&
          provider.authentication.credential
          ? [provider.authentication.credential]
          : []
      ));

      return { changed, result: undefined };
    });
    return this.#initialize;
  }
}
