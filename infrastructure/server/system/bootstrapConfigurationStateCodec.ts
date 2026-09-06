// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import type { SystemConfiguration } from "../../../application/system/index.ts";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  assertStateFields,
  requireStateRecord,
  createStateDigest,
} from "../state/index.ts";

import {
  createInitialOwnerCredential,
  migrateLegacyOwnerCredential,
  parseOwnerCredential,
  type OwnerCredentialState,
} from "./ownerCredential.ts";

const currentFormatVersion = 2;
const legacyFormatVersion = 1;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const credentialDigestPattern = /^[0-9a-f]{64}$/;
const sessionSigningKeyPattern = /^[A-Za-z0-9_-]{43}$/;
const requiresFormatRewrite = Symbol("requiresBootstrapFormatRewrite");

type BootstrapStateContent = {
  configuration: SystemConfiguration;
  formatVersion: typeof currentFormatVersion;
  ownerCredential: OwnerCredentialState;
  sessionSigningKey: string;
  version: number;
};

export type BootstrapState = BootstrapStateContent & {
  digest: `sha256:${string}`;
  [requiresFormatRewrite]?: true;
};

type LegacyBootstrapStateContent = {
  configuration: SystemConfiguration;
  formatVersion: typeof legacyFormatVersion;
  ownerCredentialDigest: string | null;
  ownerCredentialVersion: number;
  sessionSigningKey: string;
  version: number;
};

function positiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function absolutePathOrNull(value: unknown, label: string) {
  if (value === null) return null;
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be null or an absolute path.`);
  }
  return path.normalize(value);
}

function parsePublicOrigin(value: unknown, label: string) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${label} must be null or an HTTPS origin.`);
  }
  const url = new URL(value);

  if (
    url.protocol !== "https:" || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash || value !== url.origin
  ) {
    throw new Error(`${label} must be null or an HTTPS origin.`);
  }
  return url.origin;
}

export function parseSystemConfiguration(value: unknown): SystemConfiguration {
  const record = requireStateRecord(value, "configuration");

  assertStateFields(record, [
    "dataRoot",
    "listenMode",
    "maxAuditEntries",
    "port",
    "publicOrigin",
    "repositoryHostRoot",
  ], "configuration");
  if (record.listenMode !== "loopback" && record.listenMode !== "lan") {
    throw new Error("configuration.listenMode is invalid.");
  }
  const dataRoot = absolutePathOrNull(record.dataRoot, "configuration.dataRoot");
  const port = positiveInteger(record.port, "configuration.port");

  if (!dataRoot) throw new Error("configuration.dataRoot must be an absolute path.");
  if (port > 65_535) throw new Error("configuration.port must be at most 65535.");
  const publicOrigin = parsePublicOrigin(
    record.publicOrigin,
    "configuration.publicOrigin",
  );

  if (record.listenMode === "loopback" && publicOrigin !== null) {
    throw new Error("Loopback configuration cannot declare a public origin.");
  }
  if (record.listenMode === "lan" && publicOrigin === null) {
    throw new Error("LAN configuration requires an HTTPS public origin.");
  }
  return {
    dataRoot,
    listenMode: record.listenMode,
    maxAuditEntries: positiveInteger(
      record.maxAuditEntries,
      "configuration.maxAuditEntries",
    ),
    port,
    publicOrigin,
    repositoryHostRoot: absolutePathOrNull(
      record.repositoryHostRoot,
      "configuration.repositoryHostRoot",
    ),
  };
}

function stateDigest(content: BootstrapStateContent) {
  return `sha256:${createStateDigest(serializeJsonIteratively(content, {
    sortObjectKeys: true,
  }))}` as `sha256:${string}`;
}

function legacyStateDigest(content: LegacyBootstrapStateContent) {
  return `sha256:${createStateDigest(serializeJsonIteratively(content, {
    sortObjectKeys: true,
  }))}` as `sha256:${string}`;
}

function parseDigest(value: unknown) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error("bootstrap configuration digest is invalid.");
  }
  return value as `sha256:${string}`;
}

function parseSessionSigningKey(value: unknown) {
  if (typeof value !== "string" || !sessionSigningKeyPattern.test(value)) {
    throw new Error("session signing key is invalid.");
  }
  return value;
}

function assertBootstrapInvariants(content: BootstrapStateContent) {
  if (
    content.configuration.listenMode === "lan" &&
    content.ownerCredential.activeDigest === null
  ) {
    throw new Error("LAN configuration requires an active owner credential.");
  }
}

function parseLegacyCredentialDigest(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !credentialDigestPattern.test(value)) {
    throw new Error("owner credential digest is invalid.");
  }
  return value;
}

function parseCurrentState(record: Record<string, unknown>): BootstrapState {
  assertStateFields(record, [
    "configuration",
    "digest",
    "formatVersion",
    "ownerCredential",
    "sessionSigningKey",
    "version",
  ], "bootstrap configuration");
  const content: BootstrapStateContent = {
    configuration: parseSystemConfiguration(record.configuration),
    formatVersion: currentFormatVersion,
    ownerCredential: parseOwnerCredential(record.ownerCredential),
    sessionSigningKey: parseSessionSigningKey(record.sessionSigningKey),
    version: positiveInteger(record.version, "version"),
  };
  assertBootstrapInvariants(content);
  const digest = parseDigest(record.digest);

  if (stateDigest(content) !== digest) {
    throw new Error("bootstrap configuration digest does not match its content.");
  }
  return { ...content, digest };
}

function parseLegacyState(record: Record<string, unknown>): BootstrapState {
  assertStateFields(record, [
    "configuration",
    "digest",
    "formatVersion",
    "ownerCredentialDigest",
    "ownerCredentialVersion",
    "sessionSigningKey",
    "version",
  ], "bootstrap configuration");
  const activeDigest = parseLegacyCredentialDigest(
    record.ownerCredentialDigest,
  );
  const legacyContent: LegacyBootstrapStateContent = {
    configuration: parseSystemConfiguration(record.configuration),
    formatVersion: legacyFormatVersion,
    ownerCredentialDigest: activeDigest,
    ownerCredentialVersion: positiveInteger(
      record.ownerCredentialVersion,
      "ownerCredentialVersion",
    ),
    sessionSigningKey: parseSessionSigningKey(record.sessionSigningKey),
    version: positiveInteger(record.version, "version"),
  };
  const digest = parseDigest(record.digest);

  if (legacyStateDigest(legacyContent) !== digest) {
    throw new Error("bootstrap configuration digest does not match its content.");
  }
  const migrated = createBootstrapState({
    configuration: legacyContent.configuration,
    formatVersion: currentFormatVersion,
    ownerCredential: migrateLegacyOwnerCredential(
      legacyContent.ownerCredentialDigest,
      legacyContent.ownerCredentialVersion,
    ),
    sessionSigningKey: legacyContent.sessionSigningKey,
    version: legacyContent.version,
  });

  Object.defineProperty(migrated, requiresFormatRewrite, {
    configurable: true,
    enumerable: false,
    value: true,
  });
  return migrated;
}

export function parseBootstrapState(value: unknown): BootstrapState {
  const record = requireStateRecord(value, "bootstrap configuration");

  if (record.formatVersion === currentFormatVersion) {
    return parseCurrentState(record);
  }
  if (record.formatVersion === legacyFormatVersion) {
    return parseLegacyState(record);
  }
  throw new Error("bootstrap configuration format is invalid.");
}

function createBootstrapState(
  content: BootstrapStateContent,
): BootstrapState {
  assertBootstrapInvariants(content);
  return { ...content, digest: stateDigest(content) };
}

export function createInitialBootstrapState(
  configuration: SystemConfiguration,
  sessionSigningKey: string,
): BootstrapState {
  return createBootstrapState({
    configuration,
    formatVersion: currentFormatVersion,
    ownerCredential: createInitialOwnerCredential(),
    sessionSigningKey,
    version: 1,
  });
}

export function updateBootstrapStateDigest(state: BootstrapState) {
  assertBootstrapInvariants(state);
  if (state.version === Number.MAX_SAFE_INTEGER) {
    throw new Error("Bootstrap configuration version is exhausted.");
  }
  state.version += 1;
  state.digest = stateDigest({
    configuration: state.configuration,
    formatVersion: state.formatVersion,
    ownerCredential: state.ownerCredential,
    sessionSigningKey: state.sessionSigningKey,
    version: state.version,
  });
}

export function consumeBootstrapFormatRewrite(state: BootstrapState) {
  if (state[requiresFormatRewrite] !== true) return false;
  delete state[requiresFormatRewrite];
  return true;
}
