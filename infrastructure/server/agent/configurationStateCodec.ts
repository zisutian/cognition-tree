// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentChatReasoningEffort,
  AgentProfileConformance,
  AgentProfileParameters,
  AgentProviderKind,
} from "../../../application/agent/agentConfiguration.ts";
import {
  assertStateFields,
  requireStateRecord,
} from "../state/secureJsonPartition.ts";
import type {
  AgentCredentialReference,
} from "./credentialManifest.ts";
import {
  validateAgentCredentialReference,
} from "./credentialManifest.ts";

const formatVersion = 5;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const requiresFormatRewrite = Symbol("requiresAgentConfigurationFormatRewrite");
const legacyApiKey = Symbol("legacyAgentProviderApiKey");

export type StoredAuthentication =
  | {
      credential: AgentCredentialReference | null;
      type: "api-key";
      [legacyApiKey]?: string | null;
    }
  | {
      credential: AgentCredentialReference | null;
      type: "chatgpt-device-code";
    }
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
  formatVersion: typeof formatVersion;
  profiles: StoredProfile[];
  providers: StoredProvider[];
  [requiresFormatRewrite]?: true;
};

type WriteAgentApiKey = (
  providerId: string,
  apiKey: string,
  version: number,
) => Promise<AgentCredentialReference>;

export function nonEmptyString(
  value: unknown,
  pathLabel: string,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${pathLabel} must be a non-empty string.`);
  }
  return value;
}

export function positiveInteger(
  value: unknown,
  pathLabel: string,
) {
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

export function parseBaseUrl(
  value: unknown,
  pathLabel: string,
) {
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

function parseAuthentication(
  value: unknown,
  pathLabel: string,
): StoredAuthentication {
  const record = requireStateRecord(value, pathLabel);

  if (record.type === "none") {
    assertStateFields(record, ["type"], pathLabel);
    return { type: "none" };
  }
  if (record.type === "api-key" || record.type === "chatgpt-device-code") {
    assertStateFields(record, ["credential", "type"], pathLabel);
    if (record.credential === null) {
      return { credential: null, type: record.type };
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
    if (
      typeof credential.reference !== "string" ||
      credential.reference.length === 0
    ) {
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
      type: record.type,
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

  assertStateFields(
    record,
    legacyWithoutPrivatePermission
      ? ["authentication", "baseUrl", "id", "kind", "label", "version"]
      : [
          "authentication",
          "baseUrl",
          "id",
          "kind",
          "label",
          "privateNetworkOrigin",
          "version",
        ],
    pathLabel,
  );
  if (
    !(["codex", "ollama", "openai-chat"] as const).includes(
      record.kind as AgentProviderKind,
    )
  ) {
    throw new Error(`${pathLabel}.kind is invalid.`);
  }
  const kind = record.kind as AgentProviderKind;
  const authentication = legacyInlineCredential
    ? parseLegacyAuthentication(
        record.authentication,
        `${pathLabel}.authentication`,
      )
    : parseAuthentication(record.authentication, `${pathLabel}.authentication`);

  if (kind === "codex" && authentication.type === "none") {
    throw new Error(`${pathLabel} Codex authentication cannot be none.`);
  }
  if (kind !== "codex" && authentication.type === "chatgpt-device-code") {
    throw new Error(`${pathLabel} device-code authentication requires Codex.`);
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
      : parseBaseUrl(
          record.privateNetworkOrigin,
          `${pathLabel}.privateNetworkOrigin`,
        ),
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
      "kind",
      "maxInputCharacters",
      "maxOutputCharacters",
      "reasoningEffort",
    ], pathLabel);
    if (
      !(["low", "medium", "high", "xhigh"] as const).includes(
        record.reasoningEffort as "high" | "low" | "medium" | "xhigh",
      )
    ) {
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
    if (
      record.toolCallMode !== "native" &&
      record.toolCallMode !== "single-json"
    ) {
      throw new Error(`${pathLabel}.toolCallMode is invalid.`);
    }
    const reasoningEffort = legacyChatReasoning
      ? "model-default"
      : record.reasoningEffort;
    if (
      !(["model-default", "none", "low", "medium", "high"] as const).includes(
        reasoningEffort as AgentChatReasoningEffort,
      )
    ) {
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
      throw new Error(
        `${pathLabel}.historyBudgetCharacters is outside the safe integer range.`,
      );
    }
    return {
      historyBudgetCharacters,
      kind: "chat",
      maxOutputTokens: positiveInteger(
        record.maxOutputTokens,
        `${pathLabel}.maxOutputTokens`,
      ),
      maxToolSteps: positiveInteger(
        record.maxToolSteps,
        `${pathLabel}.maxToolSteps`,
      ),
      reasoningEffort: reasoningEffort as AgentChatReasoningEffort,
      toolCallMode: record.toolCallMode,
    };
  }
  throw new Error(`${pathLabel}.kind is invalid.`);
}

export function parseCurrentStoredAgentProfileParameters(
  value: unknown,
  pathLabel: string,
) {
  return parseParameters(value, pathLabel, false, false);
}

function parseConformance(
  value: unknown,
  pathLabel: string,
): AgentProfileConformance | null {
  if (value === null) return null;
  const record = requireStateRecord(value, pathLabel);

  assertStateFields(record, [
    "checkedAt",
    "profileDigest",
    "providerDigest",
    "toolCallMode",
  ], pathLabel);
  if (!Number.isFinite(Date.parse(String(record.checkedAt)))) {
    throw new Error(`${pathLabel}.checkedAt is invalid.`);
  }
  if (
    record.toolCallMode !== "native" &&
    record.toolCallMode !== "single-json"
  ) {
    throw new Error(`${pathLabel}.toolCallMode is invalid.`);
  }
  return {
    checkedAt: record.checkedAt as string,
    profileDigest: parseDigest(
      record.profileDigest,
      `${pathLabel}.profileDigest`,
    ),
    providerDigest: parseDigest(
      record.providerDigest,
      `${pathLabel}.providerDigest`,
    ),
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
    "conformance",
    "id",
    "label",
    "maxResidentSessions",
    "model",
    "parameters",
    "providerId",
    "timeoutMilliseconds",
    "version",
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
  const migratedVersion = migratedChat ? version + 1 : version;

  if (!Number.isSafeInteger(migratedVersion)) {
    throw new Error(`${pathLabel}.version is outside the safe integer range.`);
  }
  return {
    conformance: migratedChat ? null : conformance,
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
    if (providerIds.has(provider.id)) {
      throw new Error("Provider id is duplicated.");
    }
    providerIds.add(provider.id);
  }
  for (const profile of state.profiles) {
    if (profileIds.has(profile.id)) {
      throw new Error("Profile id is duplicated.");
    }
    profileIds.add(profile.id);
    const provider = state.providers.find(({ id }) =>
      id === profile.providerId
    );

    if (!provider) {
      throw new Error(`Profile provider does not exist: ${profile.providerId}`);
    }
    if ((provider.kind === "codex") !== (profile.parameters.kind === "codex")) {
      throw new Error("Profile parameters do not match provider kind.");
    }
    if (
      provider.kind !== "ollama" &&
      profile.parameters.kind === "chat" &&
      profile.parameters.toolCallMode === "single-json"
    ) {
      throw new Error("single-json is only valid for Ollama profiles.");
    }
  }
}

export function createInitialAgentConfigurationState(): AgentConfigurationState {
  return { formatVersion, profiles: [], providers: [] };
}

export function parseAgentConfigurationState(
  value: unknown,
): AgentConfigurationState {
  const record = requireStateRecord(value, "Agent configuration state");

  assertStateFields(
    record,
    ["formatVersion", "profiles", "providers"],
    "Agent configuration state",
  );
  const legacyWithoutPrivatePermission = record.formatVersion === 1;
  const legacyChatBudget = record.formatVersion === 1 ||
    record.formatVersion === 2;
  const legacyChatReasoning = legacyChatBudget || record.formatVersion === 3;
  const legacyInlineCredential = legacyChatReasoning ||
    record.formatVersion === 4;

  if (
    (!legacyInlineCredential && record.formatVersion !== formatVersion) ||
    !Array.isArray(record.profiles) ||
    !Array.isArray(record.providers)
  ) {
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

export async function materializeLegacyAgentConfigurationState(
  state: AgentConfigurationState,
  writeApiKey: WriteAgentApiKey,
) {
  const changed = state[requiresFormatRewrite] === true;

  for (const provider of state.providers) {
    if (
      provider.authentication.type !== "api-key" ||
      !(legacyApiKey in provider.authentication)
    ) {
      continue;
    }
    const apiKey = provider.authentication[legacyApiKey];
    const credential = apiKey
      ? await writeApiKey(provider.id, apiKey, 1)
      : null;

    provider.authentication = { credential, type: "api-key" };
    for (const profile of state.profiles) {
      if (profile.providerId === provider.id) profile.conformance = null;
    }
  }

  delete state[requiresFormatRewrite];
  return changed;
}
