// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentConfigurationSnapshot,
  AgentProfileConformance,
  AgentProfileInput,
  AgentProfileParameters,
  AgentProfileView,
  AgentChatReasoningEffort,
  AgentProviderKind,
  AgentProviderInput,
  AgentProviderView,
  AgentToolCallMode,
} from "../../../application/agent/agentConfiguration.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { agentConformanceContractVersion } from "../../../contracts/agent/conformance.ts";
import { agentToolContractVersion } from "../../../contracts/agent/tools.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
} from "../state/secureJsonPartition.ts";
import { createStateDigest } from "../state/stateDigest.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import {
  AgentProviderCredentialStore,
  type AgentCredentialReference,
  validateAgentCredentialReference,
} from "./providerCredentialStore.ts";

const formatVersion = 5;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const requiresFormatRewrite = Symbol("requiresAgentConfigurationFormatRewrite");
const legacyApiKey = Symbol("legacyAgentProviderApiKey");

type StoredAuthentication =
  | {
      credential: AgentCredentialReference | null;
      type: "api-key";
      [legacyApiKey]?: string | null;
    }
  | { type: "none" };

type StoredProvider = {
  authentication: StoredAuthentication;
  baseUrl: string | null;
  id: string;
  kind: AgentProviderKind;
  label: string;
  privateNetworkOrigin: string | null;
  version: number;
};

type StoredProfile = {
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

type AgentConfigurationState = {
  formatVersion: typeof formatVersion;
  profiles: StoredProfile[];
  providers: StoredProvider[];
  [requiresFormatRewrite]?: true;
};

export type ResolvedAgentConfiguration = Readonly<{
  apiKey: string | null;
  privateNetworkOrigin: string | null;
  profile: AgentProfileView;
  provider: AgentProviderView;
}>;

export type ResolvedAgentProvider = Readonly<{
  apiKey: string | null;
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

function nonEmptyString(value: unknown, pathLabel: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${pathLabel} must be a non-empty string.`);
  }
  return value;
}

function positiveInteger(value: unknown, pathLabel: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${pathLabel} must be a positive integer.`);
  }
  return value as number;
}

function parseDigest(value: unknown, pathLabel: string) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error(`${pathLabel} must be a SHA-256 digest.`);
  }
  return value as `sha256:${string}`;
}

function parseBaseUrl(value: unknown, pathLabel: string) {
  if (typeof value !== "string") {
    throw new Error(`${pathLabel} must be an absolute HTTP(S) URL.`);
  }
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${pathLabel} must be an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${pathLabel} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${pathLabel} cannot contain credentials, query, or fragment.`);
  }
  return url.toString().replace(/\/$/, "");
}

function parseAuthentication(value: unknown, pathLabel: string): StoredAuthentication {
  const record = requireStateRecord(value, pathLabel);

  if (record.type === "none") {
    assertStateFields(record, ["type"], pathLabel);
    return { type: "none" };
  }
  if (record.type === "api-key") {
    assertStateFields(record, ["credential", "type"], pathLabel);
    if (record.credential === null) {
      return { credential: null, type: "api-key" };
    }
    const credential = requireStateRecord(
      record.credential,
      `${pathLabel}.credential`,
    );

    assertStateFields(
      credential,
      ["digest", "reference", "version"],
      `${pathLabel}.credential`,
    );
    if (typeof credential.reference !== "string" ||
        credential.reference.length === 0) {
      throw new Error(`${pathLabel}.credential.reference is invalid.`);
    }
    return {
      credential: validateAgentCredentialReference({
        digest: parseDigest(
          credential.digest,
          `${pathLabel}.credential.digest`,
        ),
        reference: credential.reference,
        version: positiveInteger(
          credential.version,
          `${pathLabel}.credential.version`,
        ),
      }),
      type: "api-key",
    };
  }
  throw new Error(`${pathLabel}.type is invalid.`);
}

function parseLegacyAuthentication(
  value: unknown,
  pathLabel: string,
): StoredAuthentication {
  const record = requireStateRecord(value, pathLabel);

  if (record.type === "none") {
    assertStateFields(record, ["type"], pathLabel);
    return { type: "none" };
  }
  if (record.type === "bearer") {
    assertStateFields(record, ["apiKey", "type"], pathLabel);
    if (record.apiKey !== null && typeof record.apiKey !== "string") {
      throw new Error(`${pathLabel}.apiKey must be a string or null.`);
    }
    if (typeof record.apiKey === "string" && record.apiKey.length === 0) {
      throw new Error(`${pathLabel}.apiKey cannot be empty.`);
    }
    const authentication: StoredAuthentication = {
      credential: null,
      type: "api-key",
    };

    Object.defineProperty(authentication, legacyApiKey, {
      configurable: true,
      value: record.apiKey as string | null,
    });
    return authentication;
  }
  throw new Error(`${pathLabel}.type is invalid.`);
}

function parseProvider(
  value: unknown,
  index: number,
  legacyWithoutPrivatePermission = false,
  legacyInlineCredential = false,
): StoredProvider {
  const pathLabel = `providers[${index}]`;
  const record = requireStateRecord(value, pathLabel);

  assertStateFields(record, legacyWithoutPrivatePermission
    ? ["authentication", "baseUrl", "id", "kind", "label", "version"]
    : [
        "authentication", "baseUrl", "id", "kind", "label",
        "privateNetworkOrigin", "version",
      ], pathLabel);
  if (!(["codex", "ollama", "openai-chat"] as const).includes(
    record.kind as AgentProviderKind,
  )) {
    throw new Error(`${pathLabel}.kind is invalid.`);
  }
  const kind = record.kind as AgentProviderKind;
  const authentication = legacyInlineCredential
    ? parseLegacyAuthentication(record.authentication, `${pathLabel}.authentication`)
    : parseAuthentication(record.authentication, `${pathLabel}.authentication`);

  if (kind === "codex" && authentication.type !== "api-key") {
    throw new Error(`${pathLabel} Codex authentication must be api-key.`);
  }
  const baseUrl = kind === "codex"
    ? record.baseUrl === null
      ? null
      : (() => {
          throw new Error(`${pathLabel}.baseUrl must be null for Codex.`);
        })()
    : parseBaseUrl(record.baseUrl, `${pathLabel}.baseUrl`);

  return {
    authentication,
    baseUrl,
    id: nonEmptyString(record.id, `${pathLabel}.id`),
    kind,
    label: nonEmptyString(record.label, `${pathLabel}.label`),
    privateNetworkOrigin: legacyWithoutPrivatePermission ||
        record.privateNetworkOrigin === null
      ? null
      : parseBaseUrl(record.privateNetworkOrigin, `${pathLabel}.privateNetworkOrigin`),
    version: positiveInteger(record.version, `${pathLabel}.version`),
  };
}

function parseParameters(
  value: unknown,
  pathLabel: string,
  legacyChatBudget: boolean,
  legacyChatReasoning: boolean,
): AgentProfileParameters {
  const record = requireStateRecord(value, pathLabel);

  if (record.kind === "codex") {
    assertStateFields(record, [
      "kind", "maxInputCharacters", "maxOutputCharacters", "reasoningEffort",
    ], pathLabel);
    if (!(["low", "medium", "high", "xhigh"] as const).includes(
      record.reasoningEffort as "high" | "low" | "medium" | "xhigh",
    )) {
      throw new Error(`${pathLabel}.reasoningEffort is invalid.`);
    }
    return {
      kind: "codex",
      maxInputCharacters: positiveInteger(
        record.maxInputCharacters,
        `${pathLabel}.maxInputCharacters`,
      ),
      maxOutputCharacters: positiveInteger(
        record.maxOutputCharacters,
        `${pathLabel}.maxOutputCharacters`,
      ),
      reasoningEffort: record.reasoningEffort as
        | "high"
        | "low"
        | "medium"
        | "xhigh",
    };
  }
  if (record.kind === "chat") {
    assertStateFields(
      record,
      [
        legacyChatBudget
          ? "contextWindowTokens"
          : "historyBudgetCharacters",
        "kind",
        "maxOutputTokens",
        "maxToolSteps",
        ...(legacyChatReasoning ? [] : ["reasoningEffort"]),
        "toolCallMode",
      ],
      pathLabel,
    );
    if (record.toolCallMode !== "native" && record.toolCallMode !== "single-json") {
      throw new Error(`${pathLabel}.toolCallMode is invalid.`);
    }
    const reasoningEffort = legacyChatReasoning
      ? "model-default"
      : record.reasoningEffort;
    if (!(["model-default", "none", "low", "medium", "high"] as const).includes(
      reasoningEffort as AgentChatReasoningEffort,
    )) {
      throw new Error(`${pathLabel}.reasoningEffort is invalid.`);
    }
    const storedBudget = positiveInteger(
      legacyChatBudget
        ? record.contextWindowTokens
        : record.historyBudgetCharacters,
      `${pathLabel}.${
        legacyChatBudget
          ? "contextWindowTokens"
          : "historyBudgetCharacters"
      }`,
    );
    const historyBudgetCharacters = legacyChatBudget
      ? storedBudget * 4
      : storedBudget;

    if (!Number.isSafeInteger(historyBudgetCharacters)) {
      throw new Error(`${pathLabel}.historyBudgetCharacters is outside the safe integer range.`);
    }
    return {
      historyBudgetCharacters,
      kind: "chat",
      maxOutputTokens: positiveInteger(
        record.maxOutputTokens,
        `${pathLabel}.maxOutputTokens`,
      ),
      maxToolSteps: positiveInteger(record.maxToolSteps, `${pathLabel}.maxToolSteps`),
      reasoningEffort: reasoningEffort as AgentChatReasoningEffort,
      toolCallMode: record.toolCallMode,
    };
  }
  throw new Error(`${pathLabel}.kind is invalid.`);
}

function parseConformance(
  value: unknown,
  pathLabel: string,
): AgentProfileConformance | null {
  if (value === null) return null;
  const record = requireStateRecord(value, pathLabel);

  assertStateFields(record, [
    "checkedAt", "profileDigest", "providerDigest", "toolCallMode",
  ], pathLabel);
  if (!Number.isFinite(Date.parse(String(record.checkedAt)))) {
    throw new Error(`${pathLabel}.checkedAt is invalid.`);
  }
  if (record.toolCallMode !== "native" && record.toolCallMode !== "single-json") {
    throw new Error(`${pathLabel}.toolCallMode is invalid.`);
  }
  return {
    checkedAt: record.checkedAt as string,
    profileDigest: parseDigest(record.profileDigest, `${pathLabel}.profileDigest`),
    providerDigest: parseDigest(record.providerDigest, `${pathLabel}.providerDigest`),
    toolCallMode: record.toolCallMode,
  };
}

function parseProfile(
  value: unknown,
  index: number,
  legacyChatBudget: boolean,
  legacyChatReasoning: boolean,
): StoredProfile {
  const pathLabel = `profiles[${index}]`;
  const record = requireStateRecord(value, pathLabel);

  assertStateFields(record, [
    "conformance", "id", "label", "maxResidentSessions", "model",
    "parameters", "providerId", "timeoutMilliseconds", "version",
  ], pathLabel);
  const parameters = parseParameters(
    record.parameters,
    `${pathLabel}.parameters`,
    legacyChatBudget,
    legacyChatReasoning,
  );
  const conformance = parseConformance(
    record.conformance,
    `${pathLabel}.conformance`,
  );
  const version = positiveInteger(record.version, `${pathLabel}.version`);
  const migratedChat = parameters.kind === "chat" &&
    (legacyChatBudget || legacyChatReasoning);
  const migratedVersion = migratedChat
    ? version + 1
    : version;

  if (!Number.isSafeInteger(migratedVersion)) {
    throw new Error(`${pathLabel}.version is outside the safe integer range.`);
  }
  return {
    conformance: migratedChat
      ? null
      : conformance,
    id: nonEmptyString(record.id, `${pathLabel}.id`),
    label: nonEmptyString(record.label, `${pathLabel}.label`),
    maxResidentSessions: positiveInteger(
      record.maxResidentSessions,
      `${pathLabel}.maxResidentSessions`,
    ),
    model: nonEmptyString(record.model, `${pathLabel}.model`),
    parameters,
    providerId: nonEmptyString(record.providerId, `${pathLabel}.providerId`),
    timeoutMilliseconds: positiveInteger(
      record.timeoutMilliseconds,
      `${pathLabel}.timeoutMilliseconds`,
    ),
    version: migratedVersion,
  };
}

function validateRelationships(state: AgentConfigurationState) {
  const providerIds = new Set<string>();
  const profileIds = new Set<string>();

  for (const provider of state.providers) {
    if (providerIds.has(provider.id)) throw new Error("Provider id is duplicated.");
    providerIds.add(provider.id);
  }
  for (const profile of state.profiles) {
    if (profileIds.has(profile.id)) throw new Error("Profile id is duplicated.");
    profileIds.add(profile.id);
    const provider = state.providers.find(({ id }) => id === profile.providerId);

    if (!provider) throw new Error(`Profile provider does not exist: ${profile.providerId}`);
    if ((provider.kind === "codex") !== (profile.parameters.kind === "codex")) {
      throw new Error("Profile parameters do not match provider kind.");
    }
    if (
      provider.kind !== "ollama" && profile.parameters.kind === "chat" &&
      profile.parameters.toolCallMode === "single-json"
    ) {
      throw new Error("single-json is only valid for Ollama profiles.");
    }
  }
}

function parseConfigurationState(value: unknown): AgentConfigurationState {
  const record = requireStateRecord(value, "Agent configuration state");

  assertStateFields(record, ["formatVersion", "profiles", "providers"], "Agent configuration state");
  const legacyWithoutPrivatePermission = record.formatVersion === 1;
  const legacyChatBudget = record.formatVersion === 1 ||
    record.formatVersion === 2;
  const legacyChatReasoning = legacyChatBudget || record.formatVersion === 3;
  const legacyInlineCredential = legacyChatReasoning || record.formatVersion === 4;

  if ((!legacyInlineCredential && record.formatVersion !== formatVersion) ||
      !Array.isArray(record.profiles) || !Array.isArray(record.providers)) {
    throw new Error("Agent configuration state has an invalid format.");
  }
  const state: AgentConfigurationState = {
    formatVersion,
    profiles: record.profiles.map((profile, index) =>
      parseProfile(profile, index, legacyChatBudget, legacyChatReasoning)
    ),
    providers: record.providers.map((provider, index) =>
      parseProvider(
        provider,
        index,
        legacyWithoutPrivatePermission,
        legacyInlineCredential,
      )
    ),
  };

  if (record.formatVersion !== formatVersion) {
    Object.defineProperty(state, requiresFormatRewrite, {
      configurable: true,
      value: true,
    });
  }

  validateRelationships(state);
  return state;
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
  const authenticationMissing = provider.authentication.type === "api-key" &&
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
  const label = nonEmptyString(input.label, "Provider label");
  const baseUrl = input.kind === "codex"
    ? input.baseUrl === null
      ? null
      : (() => {
          throw new AgentConfigurationValidationError("Codex baseUrl must be null");
        })()
    : parseBaseUrl(input.baseUrl, "Provider baseUrl");

  if (input.kind === "codex" && input.authenticationType !== "api-key") {
    throw new AgentConfigurationValidationError("Codex authentication must be api-key");
  }
  if (input.authenticationType === "none" && input.apiKey !== undefined) {
    throw new AgentConfigurationValidationError("auth:none cannot include an API key");
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
  const parameters = parseParameters(
    input.parameters,
    "Profile parameters",
    false,
    false,
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
      targetPolicy = new AgentProviderTargetPolicy(),
    }: {
      createId?: () => string;
      targetPolicy?: AgentProviderTargetPolicy;
    } = {},
  ) {
    this.#createId = createId;
    this.#credentialStore = new AgentProviderCredentialStore(stateDirectory);
    this.#targetPolicy = targetPolicy;
    this.#partition = new SecureJsonPartition<AgentConfigurationState>({
      createInitial: () => ({ formatVersion, profiles: [], providers: [] }),
      directory: path.join(path.resolve(stateDirectory), "agent-config-v1"),
      fileName: "configuration.json",
      name: "Agent configuration",
      parse: parseConfigurationState,
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
        credential: storedProvider.authentication.type === "api-key"
          ? storedProvider.authentication.credential
          : null,
        privateNetworkOrigin: storedProvider.privateNetworkOrigin,
        profile: profileView(storedProfile, storedProvider),
        provider: providerView(storedProvider),
      };
    });

    if (!resolved) return null;
    return {
      apiKey: resolved.credential
        ? await this.#credentialStore.readApiKey(resolved.credential)
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
        credential: storedProvider.authentication.type === "api-key"
          ? storedProvider.authentication.credential
          : null,
        privateNetworkOrigin: storedProvider.privateNetworkOrigin,
        provider: providerView(storedProvider),
      };
    });

    if (!resolved) return null;
    return {
      apiKey: resolved.credential
        ? await this.#credentialStore.readApiKey(resolved.credential)
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
      const previousCredential = previous.authentication.type === "api-key"
        ? previous.authentication.credential
        : null;
      const nextCredential = provider.authentication.type === "api-key"
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
          credential: provider!.authentication.type === "api-key"
            ? provider!.authentication.credential
            : null,
        },
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
    if (input.apiKey === undefined) {
      return previous?.type === "api-key"
        ? previous
        : { credential: null, type: "api-key" };
    }
    if (input.apiKey === null) {
      return { credential: null, type: "api-key" };
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
      const changed = state[requiresFormatRewrite] === true;

      for (const provider of state.providers) {
        if (provider.authentication.type !== "api-key" ||
            !(legacyApiKey in provider.authentication)) continue;
        const apiKey = provider.authentication[legacyApiKey];
        const credential = apiKey
          ? await this.#credentialStore.writeApiKey(provider.id, apiKey, 1)
          : null;

        provider.authentication = { credential, type: "api-key" };
        for (const profile of state.profiles) {
          if (profile.providerId === provider.id) profile.conformance = null;
        }
      }

      delete state[requiresFormatRewrite];
      return { changed, result: undefined };
    });
    return this.#initialize;
  }
}
