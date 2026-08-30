// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { createStateDigest } from "../state/stateDigest.ts";
import {
  assertStateFields,
  requireStateRecord,
} from "../state/secureJsonPartition.ts";

export const agentCredentialFormatVersion = 1;
const agentCredentialProviderIdPattern =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const apiKeyReferencePattern =
  /^providers\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/api-key-v([1-9][0-9]*)\.json$/;
const managedReferencePattern =
  /^providers\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/codex-managed-v([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/;
const apiKeyFileNamePattern = /^api-key-v([1-9][0-9]*)\.json$/;
const managedFileNamePattern =
  /^codex-managed-v([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/;
const managedHomeNamePattern =
  /^codex-home-v([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

export const maximumAgentCredentialManifestBytes = 1024 * 1024;

export type ApiKeyCredentialManifest = Readonly<{
  apiKey: string;
  formatVersion: typeof agentCredentialFormatVersion;
  providerId: string;
  type: "api-key";
  version: number;
}>;

export type CodexManagedCredentialManifest = Readonly<{
  formatVersion: typeof agentCredentialFormatVersion;
  homeReference: string;
  providerId: string;
  type: "chatgpt-device-code";
  version: number;
}>;

export type AgentCredentialReference = Readonly<{
  digest: `sha256:${string}`;
  reference: string;
  version: number;
}>;

export type AgentCredentialEntryName =
  | Readonly<{ kind: "api-key"; version: number }>
  | Readonly<{ kind: "managed"; loginId: string; version: number }>
  | Readonly<{ kind: "managed-home"; loginId: string; version: number }>;

export type AgentCredentialReferenceIdentity =
  | Readonly<{
    kind: "api-key";
    loginId: null;
    providerId: string;
    version: number;
  }>
  | Readonly<{
    kind: "chatgpt-device-code";
    loginId: string;
    providerId: string;
    version: number;
  }>;

function positiveAgentCredentialInteger(
  value: unknown,
  pathLabel: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(`${pathLabel} must be a positive integer.`);
  }
  return value;
}

export function isAgentCredentialProviderId(value: string) {
  return agentCredentialProviderIdPattern.test(value);
}

export function assertAgentManagedCredentialIdentity(
  providerId: string,
  version: number,
  loginId: string,
) {
  if (
    !isAgentCredentialProviderId(providerId) ||
    !isAgentCredentialProviderId(loginId)
  ) {
    throw new Error("Codex managed credential identity is invalid.");
  }
  positiveAgentCredentialInteger(
    version,
    "Codex managed credential version",
  );
}

export function agentApiKeyCredentialReference(
  providerId: string,
  version: number,
) {
  if (!isAgentCredentialProviderId(providerId)) {
    throw new Error("Agent credential provider id is invalid.");
  }
  positiveAgentCredentialInteger(version, "Agent credential version");
  return `providers/${providerId}/api-key-v${version}.json`;
}

export function agentCodexManagedHomeReference(
  providerId: string,
  version: number,
  loginId: string,
) {
  assertAgentManagedCredentialIdentity(providerId, version, loginId);
  return `providers/${providerId}/codex-home-v${version}-${loginId}`;
}

export function agentCodexManagedCredentialReference(
  providerId: string,
  version: number,
  loginId: string,
) {
  assertAgentManagedCredentialIdentity(providerId, version, loginId);
  return `providers/${providerId}/codex-managed-v${version}-${loginId}.json`;
}

export function agentCredentialEntryReference(
  providerId: string,
  entryName: string,
) {
  const entry = parseAgentCredentialEntryName(entryName);

  if (
    !isAgentCredentialProviderId(providerId) ||
    !entry ||
    entry.kind === "managed-home"
  ) {
    throw new Error("Agent credential manifest entry is invalid.");
  }
  return `providers/${providerId}/${entryName}`;
}

export function parseAgentCredentialEntryName(
  name: string,
): AgentCredentialEntryName | null {
  const apiKey = apiKeyFileNamePattern.exec(name);

  if (apiKey) {
    return {
      kind: "api-key",
      version: positiveAgentCredentialInteger(
        Number(apiKey[1]),
        "Agent credential file version",
      ),
    };
  }
  const managed = managedFileNamePattern.exec(name);
  const managedHome = managedHomeNamePattern.exec(name);
  const match = managed ?? managedHome;
  const loginId = match?.[2];

  if (!match || !loginId) return null;
  return {
    kind: managed ? "managed" : "managed-home",
    loginId,
    version: positiveAgentCredentialInteger(
      Number(match[1]),
      "Codex managed credential file version",
    ),
  };
}

export function agentCredentialDigest(
  credential: ApiKeyCredentialManifest | CodexManagedCredentialManifest,
): `sha256:${string}` {
  return `sha256:${createStateDigest(serializeJsonIteratively(credential, {
    sortObjectKeys: true,
  }))}`;
}

export function serializeAgentCredentialManifest(
  credential: ApiKeyCredentialManifest | CodexManagedCredentialManifest,
) {
  const source = `${serializeJsonIteratively(credential, {
    indent: 2,
    sortObjectKeys: true,
  })}\n`;

  if (Buffer.byteLength(source) > maximumAgentCredentialManifestBytes) {
    throw new Error("Agent credential exceeds the size limit.");
  }
  return source;
}

export function parseAgentCredentialManifestJson(source: string) {
  return JSON.parse(source) as unknown;
}

export function parseApiKeyCredentialManifest(
  value: unknown,
): ApiKeyCredentialManifest {
  const record = requireStateRecord(value, "Agent provider credential");

  assertStateFields(record, [
    "apiKey", "formatVersion", "providerId", "type", "version",
  ], "Agent provider credential");
  if (
    record.formatVersion !== agentCredentialFormatVersion ||
    record.type !== "api-key"
  ) {
    throw new Error("Agent provider credential has an invalid format.");
  }
  if (typeof record.apiKey !== "string" || record.apiKey.length === 0) {
    throw new Error("Agent provider credential API key is invalid.");
  }
  if (
    typeof record.providerId !== "string" ||
    !isAgentCredentialProviderId(record.providerId)
  ) {
    throw new Error("Agent provider credential provider id is invalid.");
  }
  return {
    apiKey: record.apiKey,
    formatVersion: agentCredentialFormatVersion,
    providerId: record.providerId,
    type: "api-key",
    version: positiveAgentCredentialInteger(
      record.version,
      "Agent provider credential version",
    ),
  };
}

export function parseCodexManagedCredentialManifest(
  value: unknown,
): CodexManagedCredentialManifest {
  const record = requireStateRecord(value, "Codex managed credential");

  assertStateFields(record, [
    "formatVersion", "homeReference", "providerId", "type", "version",
  ], "Codex managed credential");
  if (
    record.formatVersion !== agentCredentialFormatVersion ||
    record.type !== "chatgpt-device-code" ||
    typeof record.providerId !== "string" ||
    !isAgentCredentialProviderId(record.providerId) ||
    typeof record.homeReference !== "string"
  ) {
    throw new Error("Codex managed credential has an invalid format.");
  }
  return {
    formatVersion: agentCredentialFormatVersion,
    homeReference: record.homeReference,
    providerId: record.providerId,
    type: "chatgpt-device-code",
    version: positiveAgentCredentialInteger(
      record.version,
      "Codex managed credential version",
    ),
  };
}

export function parseAgentCredentialReference(
  reference: AgentCredentialReference,
): AgentCredentialReferenceIdentity {
  const apiKeyMatch = apiKeyReferencePattern.exec(reference.reference);
  const managedMatch = managedReferencePattern.exec(reference.reference);
  const match = apiKeyMatch ?? managedMatch;

  if (!match || !digestPattern.test(reference.digest)) {
    throw new Error("Agent credential reference is invalid.");
  }
  const providerId = match[1];
  const pathVersion = match[2];

  if (!providerId || !pathVersion) {
    throw new Error("Agent credential reference path is invalid.");
  }
  const version = positiveAgentCredentialInteger(
    reference.version,
    "Agent credential version",
  );

  if (Number(pathVersion) !== version) {
    throw new Error(
      "Agent credential reference version does not match its path.",
    );
  }
  if (apiKeyMatch) {
    return { kind: "api-key", loginId: null, providerId, version };
  }
  const loginId = managedMatch?.[3];

  if (!loginId) {
    throw new Error("Codex managed credential login id is invalid.");
  }
  return {
    kind: "chatgpt-device-code",
    loginId,
    providerId,
    version,
  };
}

export function validateAgentCredentialReference(
  reference: AgentCredentialReference,
) {
  parseAgentCredentialReference(reference);
  return reference;
}
