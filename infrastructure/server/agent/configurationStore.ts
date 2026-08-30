// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentProfileInput,
  AgentProfileView,
  AgentProviderInput,
  AgentProviderView,
  AgentToolCallMode,
} from "../../../application/agent/agentConfiguration.ts";
import {
  SecureJsonPartition,
  SecureStateCommitOutcomeUnknownError,
  type SecureStateFileReplacer,
} from "../state/secureJsonPartition.ts";
import {
  AgentConfigurationAccess,
  type AgentConfigurationProfileUse,
  type AgentConfigurationProviderChange,
  type AgentConfigurationProviderUse,
} from "./configurationAccess.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import {
  AgentProviderCredentialStore,
  type AgentCredentialReference,
} from "./providerCredentialStore.ts";
import {
  createInitialAgentConfigurationState,
  materializeLegacyAgentConfigurationState,
  parseAgentConfigurationState,
  type AgentConfigurationState,
  type StoredAuthentication,
  type StoredProvider,
} from "./configurationStateCodec.ts";
import {
  AgentConfigurationValidationError,
} from "./configurationErrors.ts";
import {
  normalizeProviderInput,
} from "./configurationInput.ts";
import { assertAgentConfigurationRevision } from "./configurationRevision.ts";
import {
  configurationSnapshot,
  profileView,
  providerView,
} from "./configurationViews.ts";
import { AgentProfileConfiguration } from "./profileConfiguration.ts";

export {
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
} from "./configurationErrors.ts";

export type ResolvedAgentConfiguration = Readonly<{
  apiKey: string | null;
  codexHome: string | null;
  privateNetworkOrigin: string | null;
  profile: AgentProfileView;
  provider: AgentProviderView;
}>;

export type ResolvedAgentProvider = Readonly<{
  apiKey: string | null;
  codexHome: string | null;
  privateNetworkOrigin: string | null;
  provider: AgentProviderView;
}>;

export class AgentConfigurationStore {
  readonly access = new AgentConfigurationAccess();
  readonly #createId: () => string;
  readonly #credentialStore: AgentProviderCredentialStore;
  #initialize: Promise<void> | null = null;
  readonly #partition: SecureJsonPartition<AgentConfigurationState>;
  readonly #profiles: AgentProfileConfiguration;
  readonly #targetPolicy: AgentProviderTargetPolicy;

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
    this.#createId = createId;
    this.#credentialStore = new AgentProviderCredentialStore(stateDirectory);
    this.#targetPolicy = targetPolicy;
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
        const storedProvider = state.providers.find(({ id }) =>
          id === storedProfile.providerId
        )!;

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
    let candidate: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;

    try {
      return await this.#mutate(async (state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const id = `agent-provider-${this.#createId()}`;
        const normalized = normalizeProviderInput(input, this.#targetPolicy);
        const prepared = await this.#authenticationForInput(id, input);
        const provider: StoredProvider = {
          ...normalized,
          authentication: prepared.authentication,
          id,
          version: 1,
        };

        candidate = prepared.candidate;
        state.providers.push(provider);
        candidateMayBeAuthoritative = candidate !== null;
        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            provider: providerView(provider),
          },
        };
      });
    } catch (error) {
      await this.#removeRejectedCredentialCandidate(
        candidate,
        candidateMayBeAuthoritative,
        error,
      );
      throw error;
    }
  }

  async updateProvider(
    baseRevision: string,
    providerId: string,
    input: AgentProviderInput,
  ) {
    let candidate: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate(async (state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const index = state.providers.findIndex(({ id }) => id === providerId);

        if (index < 0) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const previous = state.providers[index]!;
        const normalized = normalizeProviderInput(input, this.#targetPolicy);
        const prepared = await this.#authenticationForInput(
          previous.id,
          input,
          previous.authentication,
        );
        const provider: StoredProvider = {
          ...normalized,
          authentication: prepared.authentication,
          id: previous.id,
          version: previous.version + 1,
        };

        candidate = prepared.candidate;
        for (const profile of state.profiles) {
          if (profile.providerId === providerId) profile.conformance = null;
        }
        state.providers[index] = provider;
        candidateMayBeAuthoritative = candidate !== null;
        const previousCredential = previous.authentication.type !== "none"
          ? previous.authentication.credential
          : null;
        const nextCredential = provider.authentication.type !== "none"
          ? provider.authentication.credential
          : null;
        return {
          changed: true,
          result: {
            credentialToRemove: previousCredential &&
                previousCredential.reference !== nextCredential?.reference
              ? previousCredential
              : null,
            value: {
              configuration: configurationSnapshot(state),
              provider: providerView(provider),
            },
          },
        };
      });

      if (outcome.credentialToRemove) {
        await this.#credentialStore.remove(outcome.credentialToRemove)
          .catch(() => undefined);
      }
      return outcome.value;
    } catch (error) {
      await this.#removeRejectedCredentialCandidate(
        candidate,
        candidateMayBeAuthoritative,
        error,
      );
      throw error;
    } finally {
      lifecycle.change?.release();
    }
  }

  async deleteProvider(baseRevision: string, providerId: string) {
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        if (state.profiles.some(({ providerId: candidate }) =>
          candidate === providerId
        )) {
          throw new AgentConfigurationValidationError(
            "Delete profiles that reference this provider first",
          );
        }
        const index = state.providers.findIndex(({ id }) => id === providerId);

        if (index < 0) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const [provider] = state.providers.splice(index, 1);

        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            credential: provider!.authentication.type !== "none"
              ? provider!.authentication.credential
              : null,
          },
        };
      });

      if (outcome.credential) {
        await this.#credentialStore.remove(outcome.credential)
          .catch(() => undefined);
      }
      return outcome.configuration;
    } finally {
      lifecycle.change?.release();
    }
  }

  reserveProviderChange(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentConfigurationProviderChange> {
    return this.#read((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      if (!state.providers.some(({ id }) => id === providerId)) {
        throw new AgentConfigurationValidationError(
          "Agent provider does not exist",
        );
      }
      return this.#beginProviderChange(state, providerId);
    });
  }

  async prepareCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    loginId: string,
    change: AgentConfigurationProviderChange | null = null,
  ) {
    const credentialVersion = await this.#read((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === providerId);

      if (!provider || provider.kind !== "codex" ||
          provider.authentication.type !== "chatgpt-device-code") {
        throw new AgentConfigurationValidationError(
          "Codex device login requires a device-code provider",
        );
      }
      if (change) this.access.assertProviderChange(change, providerId);
      return (provider.authentication.credential?.version ?? 0) + 1;
    });
    const { home } = await this.#credentialStore.prepareCodexManagedHome(
      providerId,
      credentialVersion,
      loginId,
    );

    return { credentialVersion, home };
  }

  removeCodexDeviceLoginStaging(
    providerId: string,
    credentialVersion: number,
    loginId: string,
  ) {
    return this.#credentialStore.removeCodexStagingHome(
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
    const change = reservedChange ?? await this.reserveProviderChange(
      baseRevision,
      providerId,
    );
    const ownsChange = reservedChange === null;
    let credential: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;

    try {
      this.access.assertProviderChange(change, providerId);
      credential = await this.#credentialStore.activateCodexManagedHome(
        providerId,
        credentialVersion,
        loginId,
      );
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        this.access.assertProviderChange(change, providerId);
        const provider = state.providers.find(({ id }) => id === providerId);

        if (!provider || provider.kind !== "codex" ||
            provider.authentication.type !== "chatgpt-device-code") {
          throw new AgentConfigurationValidationError(
            "Codex device login provider changed",
          );
        }
        const previousCredential = provider.authentication.credential;

        provider.authentication = {
          credential: credential!,
          type: "chatgpt-device-code",
        };
        candidateMayBeAuthoritative = true;
        provider.version += 1;
        for (const profile of state.profiles) {
          if (profile.providerId === providerId) profile.conformance = null;
        }
        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            previousCredential,
          },
        };
      });

      if (outcome.previousCredential) {
        await this.#credentialStore.remove(outcome.previousCredential)
          .catch(() => undefined);
      }
      return outcome.configuration;
    } catch (error) {
      await this.#removeRejectedCredentialCandidate(
        credential,
        candidateMayBeAuthoritative,
        error,
      );
      throw error;
    } finally {
      if (ownsChange) change.release();
    }
  }

  async clearProviderAuthentication(
    baseRevision: string,
    providerId: string,
  ) {
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const provider = state.providers.find(({ id }) => id === providerId);

        if (!provider || provider.authentication.type === "none") {
          throw new AgentConfigurationValidationError(
            "Agent provider authentication cannot be cleared",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const credential = provider.authentication.credential;

        provider.authentication = {
          credential: null,
          type: provider.authentication.type,
        };
        provider.version += 1;
        for (const profile of state.profiles) {
          if (profile.providerId === providerId) profile.conformance = null;
        }
        return {
          changed: true,
          result: { configuration: configurationSnapshot(state), credential },
        };
      });

      if (outcome.credential) {
        await this.#credentialStore.remove(outcome.credential)
          .catch(() => undefined);
      }
      return outcome.configuration;
    } finally {
      lifecycle.change?.release();
    }
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

  async #authenticationForInput(
    providerId: string,
    input: AgentProviderInput,
    previous: StoredAuthentication | null = null,
  ): Promise<{
    authentication: StoredAuthentication;
    candidate: AgentCredentialReference | null;
  }> {
    if (input.authenticationType === "none") {
      return { authentication: { type: "none" }, candidate: null };
    }
    if (input.authenticationType === "chatgpt-device-code") {
      return {
        authentication: previous?.type === "chatgpt-device-code"
          ? previous
          : { credential: null, type: "chatgpt-device-code" },
        candidate: null,
      };
    }
    if (input.apiKey === undefined) {
      return {
        authentication: previous?.type === "api-key"
          ? previous
          : { credential: null, type: "api-key" },
        candidate: null,
      };
    }
    const previousVersion = previous?.type === "api-key"
      ? previous.credential?.version ?? 0
      : 0;
    const credential = await this.#credentialStore.writeApiKey(
      providerId,
      input.apiKey,
      previousVersion + 1,
    );

    return {
      authentication: { credential, type: "api-key" },
      candidate: credential,
    };
  }

  #beginProviderChange(
    state: AgentConfigurationState,
    providerId: string,
  ) {
    return this.access.beginProviderChange(
      providerId,
      state.profiles
        .filter(({ providerId: candidate }) => candidate === providerId)
        .map(({ id }) => id),
    );
  }

  async #removeRejectedCredentialCandidate(
    candidate: AgentCredentialReference | null,
    candidateMayBeAuthoritative: boolean,
    error: unknown,
  ) {
    if (!candidate ||
        (candidateMayBeAuthoritative &&
          error instanceof SecureStateCommitOutcomeUnknownError)) return;
    await this.#credentialStore.remove(candidate).catch(() => undefined);
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
