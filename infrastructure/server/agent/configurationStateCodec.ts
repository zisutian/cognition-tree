// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationState,
  AgentCredentialReference,
  AgentProfileConformance,
  AgentProfileParameters,
  AgentProviderKind,
  StoredAuthentication,
  StoredProfile,
  StoredProvider,
} from "../../../application/agentConfiguration/index.ts";
import { agentConfigurationFormatVersion, parseAgentProfileParameters, validateAgentConfigurationRelationships } from "../../../application/agentConfiguration/index.ts";
import {
  nonEmptyString,
  parseBaseUrl,
  positiveInteger,
} from "../../../application/agentConfiguration/index.ts";
import {
  assertStateFields,
  requireStateRecord,
} from "../state/index.ts";
import {
  validateAgentCredentialReference,
} from "./credentialManifest.ts";

const formatVersion = agentConfigurationFormatVersion;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const requiresFormatRewrite = Symbol("requiresAgentConfigurationFormatRewrite");
const legacyApiKey = Symbol("legacyAgentProviderApiKey");

type DecodingState = AgentConfigurationState & { [requiresFormatRewrite]?: true };

type WriteAgentApiKey = (
  providerId: string,
  apiKey: string,
  version: number,
) => Promise<AgentCredentialReference>;

function parseDigest(value: unknown, pathLabel: string) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error(`${pathLabel} must be a SHA-256 digest.`);
  }
  return value as `sha256:${string}`;
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
  if (!legacyChatBudget && !legacyChatReasoning) {
    return parseAgentProfileParameters(value, pathLabel);
  }
  const record = requireStateRecord(value, pathLabel);
  if (record.kind !== "chat") {
    return parseAgentProfileParameters(value, pathLabel);
  }
  assertStateFields(record, [
    legacyChatBudget ? "contextWindowTokens" : "historyBudgetCharacters",
    "kind", "maxOutputTokens", "maxToolSteps",
    ...(legacyChatReasoning ? [] : ["reasoningEffort"]),
    "toolCallMode",
  ], pathLabel);
  const current = {
    historyBudgetCharacters: 1,
    kind: "chat",
    maxOutputTokens: record.maxOutputTokens,
    maxToolSteps: record.maxToolSteps,
    reasoningEffort: legacyChatReasoning ? "model-default" : record.reasoningEffort,
    toolCallMode: record.toolCallMode,
  };
  // Preserve enum validation before the historical budget conversion.
  parseAgentProfileParameters({ ...current, maxOutputTokens: 1, maxToolSteps: 1 }, pathLabel);
  const budgetField = legacyChatBudget ? "contextWindowTokens" : "historyBudgetCharacters";
  const storedBudget = positiveInteger(record[budgetField], `${pathLabel}.${budgetField}`);
  const historyBudgetCharacters = legacyChatBudget ? storedBudget * 4 : storedBudget;
  if (!Number.isSafeInteger(historyBudgetCharacters)) {
    throw new Error(`${pathLabel}.historyBudgetCharacters is outside the safe integer range.`);
  }
  return parseAgentProfileParameters({
    ...current,
    historyBudgetCharacters,
  }, pathLabel);
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
  const state: DecodingState = {
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

  validateAgentConfigurationRelationships(state);
  return state;
}

export async function materializeLegacyAgentConfigurationState(
  state: AgentConfigurationState,
  writeApiKey: WriteAgentApiKey,
) {
  const decodingState = state as DecodingState;
  const changed = decodingState[requiresFormatRewrite] === true;

  for (const provider of state.providers) {
    if (
      provider.authentication.type !== "api-key" ||
      !(legacyApiKey in provider.authentication)
    ) {
      continue;
    }
    const apiKey = provider.authentication[legacyApiKey] as string | null;
    const credential = apiKey
      ? await writeApiKey(provider.id, apiKey, 1)
      : null;

    provider.authentication = { credential, type: "api-key" };
    for (const profile of state.profiles) {
      if (profile.providerId === provider.id) profile.conformance = null;
    }
  }

  delete decodingState[requiresFormatRewrite];
  return changed;
}
