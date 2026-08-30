// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentConfigurationSnapshot,
  AgentProfileInput,
  AgentProfileView,
  AgentProviderInput,
  AgentProviderView,
  AgentToolCallMode,
} from "../../../application/agent/agentConfiguration.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { agentConformanceContractVersion } from "../../../contracts/agent/conformance.ts";
import { agentToolContractVersion } from "../../../contracts/agent/tools.ts";
import {
  SecureJsonPartition,
  SecureStateCommitOutcomeUnknownError,
  type SecureStateFileReplacer,
} from "../state/secureJsonPartition.ts";
import { createStateDigest } from "../state/stateDigest.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import { AgentProviderCredentialStore } from "./providerCredentialStore.ts";
import {
  createInitialAgentConfigurationState,
  materializeLegacyAgentConfigurationState,
  nonEmptyString,
  parseBaseUrl,
  parseAgentConfigurationState,
  parseCurrentStoredAgentProfileParameters,
  positiveInteger,
  type AgentConfigurationState,
  type StoredAuthentication,
  type StoredProfile,
  type StoredProvider,
} from "./configurationStateCodec.ts";

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

export class AgentConfigurationConflictError extends Error {
  readonly currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("Agent configuration revision changed");
    this.name = "AgentConfigurationConflictError";
    this.currentRevision = currentRevision;
  }
}

export class AgentConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigurationValidationError";
  }
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createStateDigest(serializeJsonIteratively(value, {
    sortObjectKeys: true,
  }))}`;
}

function stateRevision(state: AgentConfigurationState) {
  return digest(state);
}

function providerDigest(provider: StoredProvider) {
  return digest(provider);
}

function profileDigest(profile: StoredProfile) {
  const { conformance: _conformance, ...configuration } = profile;

  return digest({
    agentConformanceContractVersion,
    agentToolContractVersion,
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
        state.providers.find(({ id }) => id === profile.providerId)!,
      )
    ),
    providers: state.providers.map(providerView),
    revision: stateRevision(state),
  };
}

function assertBaseRevision(
  state: AgentConfigurationState,
  baseRevision: string,
) {
  const current = stateRevision(state);

  if (baseRevision !== current) throw new AgentConfigurationConflictError(current);
}

function normalizeProviderInput(
  input: AgentProviderInput,
  targetPolicy: AgentProviderTargetPolicy,
): Omit<StoredProvider, "authentication" | "id" | "version"> {
  const label = nonEmptyString(
    input.label,
    "Provider label",
  );
  const baseUrl = input.kind === "codex"
    ? input.baseUrl === null
      ? null
      : (() => {
          throw new AgentConfigurationValidationError("Codex baseUrl must be null");
        })()
    : parseBaseUrl(input.baseUrl, "Provider baseUrl");

  if (input.kind === "codex" && input.authenticationType === "none") {
    throw new AgentConfigurationValidationError("Codex authentication cannot be none");
  }
  if (input.kind !== "codex" &&
      input.authenticationType === "chatgpt-device-code") {
    throw new AgentConfigurationValidationError(
      "Device-code authentication requires a Codex provider",
    );
  }
  if (input.authenticationType !== "api-key" && input.apiKey !== undefined) {
    throw new AgentConfigurationValidationError(
      "Only api-key authentication can include an API key",
    );
  }
  if (input.authenticationType === "api-key" && input.apiKey === "") {
    throw new AgentConfigurationValidationError("API key cannot be empty");
  }
  const privateNetworkOrigin = baseUrl === null
    ? null
    : targetPolicy.configurationPermission(
        new URL(baseUrl),
        input.authenticationType,
        input.privateNetworkAccessConfirmed,
      );

  return {
    baseUrl,
    kind: input.kind,
    label,
    privateNetworkOrigin,
  };
}

function normalizeProfileInput(
  input: AgentProfileInput,
  provider: StoredProvider,
): Omit<StoredProfile, "conformance" | "id" | "version"> {
  const parameters = parseCurrentStoredAgentProfileParameters(
    input.parameters,
    "Profile parameters",
  );

  if ((provider.kind === "codex") !== (parameters.kind === "codex")) {
    throw new AgentConfigurationValidationError(
      "Profile parameters do not match provider kind",
    );
  }
  if (
    provider.kind !== "ollama" && parameters.kind === "chat" &&
    parameters.toolCallMode === "single-json"
  ) {
    throw new AgentConfigurationValidationError(
      "single-json is only valid for Ollama profiles",
    );
  }
  if (
    provider.kind !== "ollama" && parameters.kind === "chat" &&
    parameters.reasoningEffort !== "model-default"
  ) {
    throw new AgentConfigurationValidationError(
      "Explicit chat reasoning effort is only valid for Ollama profiles",
    );
  }
  if (parameters.kind === "chat" && parameters.maxToolSteps < 3) {
    throw new AgentConfigurationValidationError(
      "Chat profiles require at least 3 tool steps",
    );
  }
  return {
    label: nonEmptyString(input.label, "Profile label"),
    maxResidentSessions: positiveInteger(
      input.maxResidentSessions,
      "Profile maxResidentSessions",
    ),
    model: nonEmptyString(input.model, "Profile model"),
    parameters,
    providerId: provider.id,
    timeoutMilliseconds: positiveInteger(
      input.timeoutMilliseconds,
      "Profile timeoutMilliseconds",
    ),
  };
}

export class AgentConfigurationStore {
  readonly #createId: () => string;
  readonly #credentialStore: AgentProviderCredentialStore;
  #initialize: Promise<void> | null = null;
  readonly #partition: SecureJsonPartition<AgentConfigurationState>;
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
  }

  readSnapshot() {
    return this.#read(configurationSnapshot);
  }

  async resolveProfile(profileId: string): Promise<ResolvedAgentConfiguration | null> {
    const resolved = await this.#read((state) => {
      const storedProfile = state.profiles.find(({ id }) => id === profileId);

      if (!storedProfile) return null;
      const storedProvider = state.providers.find(({ id }) =>
        id === storedProfile.providerId
      )!;
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
  }

  async resolveProvider(providerId: string): Promise<ResolvedAgentProvider | null> {
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
  }

  createProvider(baseRevision: string, input: AgentProviderInput) {
    return this.#mutate(async (state) => {
      assertBaseRevision(state, baseRevision);
      const id = `agent-provider-${this.#createId()}`;
      const provider: StoredProvider = {
        ...normalizeProviderInput(input, this.#targetPolicy),
        authentication: await this.#authenticationForInput(id, input),
        id,
        version: 1,
      };

      state.providers.push(provider);
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          provider: providerView(provider),
        },
      };
    });
  }

  async updateProvider(
    baseRevision: string,
    providerId: string,
    input: AgentProviderInput,
  ) {
    const outcome = await this.#mutate(async (state) => {
      assertBaseRevision(state, baseRevision);
      const index = state.providers.findIndex(({ id }) => id === providerId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
      const previous = state.providers[index]!;
      const provider: StoredProvider = {
        ...normalizeProviderInput(input, this.#targetPolicy),
        authentication: await this.#authenticationForInput(
          previous.id,
          input,
          previous.authentication,
        ),
        id: previous.id,
        version: previous.version + 1,
      };

      for (const profile of state.profiles) {
        if (profile.providerId === providerId) profile.conformance = null;
      }
      state.providers[index] = provider;
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
      await this.#credentialStore.remove(outcome.credentialToRemove);
    }
    return outcome.value;
  }

  async deleteProvider(baseRevision: string, providerId: string) {
    const outcome = await this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      if (state.profiles.some(({ providerId: candidate }) => candidate === providerId)) {
        throw new AgentConfigurationValidationError(
          "Delete profiles that reference this provider first",
        );
      }
      const index = state.providers.findIndex(({ id }) => id === providerId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
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

    if (outcome.credential) await this.#credentialStore.remove(outcome.credential);
    return outcome.configuration;
  }

  async prepareCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    loginId: string,
  ) {
    const credentialVersion = await this.#read((state) => {
      assertBaseRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === providerId);

      if (!provider || provider.kind !== "codex" ||
          provider.authentication.type !== "chatgpt-device-code") {
        throw new AgentConfigurationValidationError(
          "Codex device login requires a device-code provider",
        );
      }
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
  ) {
    const credential = await this.#credentialStore.activateCodexManagedHome(
      providerId,
      credentialVersion,
      loginId,
    );
    let candidateReferencesActivatedCredential = false;

    const outcome = await this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === providerId);

      if (!provider || provider.kind !== "codex" ||
          provider.authentication.type !== "chatgpt-device-code") {
        throw new AgentConfigurationValidationError(
          "Codex device login provider changed",
        );
      }
      const previousCredential = provider.authentication.credential;

      provider.authentication = {
        credential,
        type: "chatgpt-device-code",
      };
      candidateReferencesActivatedCredential = true;
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
    }).catch(async (error: unknown) => {
      const candidateMayBeAuthoritative =
        candidateReferencesActivatedCredential &&
        error instanceof SecureStateCommitOutcomeUnknownError;

      if (!candidateMayBeAuthoritative) {
        await this.#credentialStore.remove(credential).catch(() => undefined);
      }
      throw error;
    });

    if (outcome.previousCredential) {
      await this.#credentialStore.remove(outcome.previousCredential)
        .catch(() => undefined);
    }
    return outcome.configuration;
  }

  async clearProviderAuthentication(
    baseRevision: string,
    providerId: string,
  ) {
    const outcome = await this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === providerId);

      if (!provider || provider.authentication.type === "none") {
        throw new AgentConfigurationValidationError(
          "Agent provider authentication cannot be cleared",
        );
      }
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

    if (outcome.credential) await this.#credentialStore.remove(outcome.credential);
    return outcome.configuration;
  }

  createProfile(baseRevision: string, input: AgentProfileInput) {
    return this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === input.providerId);

      if (!provider) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
      const profile: StoredProfile = {
        ...normalizeProfileInput(input, provider),
        conformance: null,
        id: `agent-profile-${this.#createId()}`,
        version: 1,
      };

      state.profiles.push(profile);
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }

  updateProfile(
    baseRevision: string,
    profileId: string,
    input: AgentProfileInput,
  ) {
    return this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const index = state.profiles.findIndex(({ id }) => id === profileId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      const provider = state.providers.find(({ id }) => id === input.providerId);

      if (!provider) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
      const previous = state.profiles[index]!;
      const profile: StoredProfile = {
        ...normalizeProfileInput(input, provider),
        conformance: null,
        id: previous.id,
        version: previous.version + 1,
      };

      state.profiles[index] = profile;
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }

  deleteProfile(baseRevision: string, profileId: string) {
    return this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const index = state.profiles.findIndex(({ id }) => id === profileId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      state.profiles.splice(index, 1);
      return { changed: true, result: configurationSnapshot(state) };
    });
  }

  setConformance(
    baseRevision: string,
    profileId: string,
    input: { checkedAt: string; toolCallMode: AgentToolCallMode },
  ) {
    return this.#mutate((state) => {
      assertBaseRevision(state, baseRevision);
      const profile = state.profiles.find(({ id }) => id === profileId);

      if (!profile) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      const provider = state.providers.find(({ id }) => id === profile.providerId)!;

      if (profile.parameters.kind !== "chat") {
        throw new AgentConfigurationValidationError(
          "Codex profiles do not use chat conformance",
        );
      }
      if (profile.parameters.toolCallMode !== input.toolCallMode) {
        throw new AgentConfigurationValidationError(
          "Conformance mode does not match the profile",
        );
      }
      if (!Number.isFinite(Date.parse(input.checkedAt))) {
        throw new AgentConfigurationValidationError("Conformance timestamp is invalid");
      }
      profile.conformance = {
        checkedAt: input.checkedAt,
        profileDigest: profileDigest(profile),
        providerDigest: providerDigest(provider),
        toolCallMode: input.toolCallMode,
      };
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }

  async #authenticationForInput(
    providerId: string,
    input: AgentProviderInput,
    previous: StoredAuthentication | null = null,
  ): Promise<StoredAuthentication> {
    if (input.authenticationType === "none") return { type: "none" };
    if (input.authenticationType === "chatgpt-device-code") {
      return previous?.type === "chatgpt-device-code"
        ? previous
        : { credential: null, type: "chatgpt-device-code" };
    }
    if (input.apiKey === undefined) {
      return previous?.type === "api-key"
        ? previous
        : { credential: null, type: "api-key" };
    }
    const previousVersion = previous?.type === "api-key"
      ? previous.credential?.version ?? 0
      : 0;
    const credential = await this.#credentialStore.writeApiKey(
      providerId,
      input.apiKey,
      previousVersion + 1,
    );

    return { credential, type: "api-key" };
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

      return { changed, result: undefined };
    });
    return this.#initialize;
  }
}
