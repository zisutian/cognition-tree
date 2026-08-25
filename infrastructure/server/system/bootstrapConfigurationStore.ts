// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { chmod, lstat, mkdir } from "node:fs/promises";
import {
  SystemConfigurationConflictError,
  SystemConfigurationValidationError,
} from "../../../application/system/systemConfiguration.ts";
import type {
  SystemConfiguration,
  SystemConfigurationInput,
} from "../../../application/system/systemConfiguration.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
} from "../state/secureJsonPartition.ts";
import { createStateDigest } from "../state/stateDigest.ts";
import { replaceFileDurably } from "../persistence/fileSystemPersistence.ts";

const formatVersion = 1;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const ownerSessionTtlMilliseconds = 12 * 60 * 60 * 1_000;

type BootstrapState = {
  configuration: SystemConfiguration;
  digest: `sha256:${string}`;
  formatVersion: typeof formatVersion;
  ownerCredentialDigest: string | null;
  ownerCredentialVersion: number;
  sessionSigningKey: string;
  version: number;
};

export type BootstrapConfigurationSnapshot = Readonly<{
  configuration: SystemConfiguration;
  ownerCredentialConfigured: boolean;
  revision: `sha256:${string}`;
  version: number;
}>;

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

function parseConfiguration(value: unknown): SystemConfiguration {
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

function digestSource(state: Omit<BootstrapState, "digest">) {
  return `sha256:${createStateDigest(serializeJsonIteratively(state, {
    sortObjectKeys: true,
  }))}` as `sha256:${string}`;
}

function withDigest(
  state: Omit<BootstrapState, "digest">,
): BootstrapState {
  return { ...state, digest: digestSource(state) };
}

function parseState(value: unknown): BootstrapState {
  const record = requireStateRecord(value, "bootstrap configuration");

  assertStateFields(record, [
    "configuration",
    "digest",
    "formatVersion",
    "ownerCredentialDigest",
    "ownerCredentialVersion",
    "sessionSigningKey",
    "version",
  ], "bootstrap configuration");
  if (record.formatVersion !== formatVersion) {
    throw new Error("bootstrap configuration format is invalid.");
  }
  if (typeof record.digest !== "string" || !digestPattern.test(record.digest)) {
    throw new Error("bootstrap configuration digest is invalid.");
  }
  if (record.ownerCredentialDigest !== null &&
      (typeof record.ownerCredentialDigest !== "string" ||
        !/^[0-9a-f]{64}$/.test(record.ownerCredentialDigest))) {
    throw new Error("owner credential digest is invalid.");
  }
  if (typeof record.sessionSigningKey !== "string" ||
      record.sessionSigningKey.length < 43) {
    throw new Error("session signing key is invalid.");
  }
  const parsed: Omit<BootstrapState, "digest"> = {
    configuration: parseConfiguration(record.configuration),
    formatVersion,
    ownerCredentialDigest: record.ownerCredentialDigest as string | null,
    ownerCredentialVersion: positiveInteger(
      record.ownerCredentialVersion,
      "ownerCredentialVersion",
    ),
    sessionSigningKey: record.sessionSigningKey,
    version: positiveInteger(record.version, "version"),
  };
  const digest = digestSource(parsed);

  if (digest !== record.digest) {
    throw new Error("bootstrap configuration digest does not match its content.");
  }
  return { ...parsed, digest };
}

function project(state: BootstrapState): BootstrapConfigurationSnapshot {
  return {
    configuration: { ...state.configuration },
    ownerCredentialConfigured: state.ownerCredentialDigest !== null,
    revision: state.digest,
    version: state.version,
  };
}

function credentialDigest(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function assertRevision(state: BootstrapState, baseRevision: string) {
  if (baseRevision !== state.digest) {
    throw new SystemConfigurationConflictError(state.digest);
  }
}

function updateStateDigest(state: BootstrapState) {
  state.version += 1;
  state.digest = digestSource({
    configuration: state.configuration,
    formatVersion: state.formatVersion,
    ownerCredentialDigest: state.ownerCredentialDigest,
    ownerCredentialVersion: state.ownerCredentialVersion,
    sessionSigningKey: state.sessionSigningKey,
    version: state.version,
  });
}

export class BootstrapConfigurationStore {
  readonly #controlDirectory: string;
  readonly #file: string;
  readonly #partition: SecureJsonPartition<BootstrapState>;
  readonly #projectRoot: string;

  constructor(projectRoot: string) {
    const root = path.resolve(projectRoot);

    this.#projectRoot = root;
    this.#controlDirectory = path.join(root, ".cognition-tree", "bootstrap-v1");
    this.#file = path.join(this.#controlDirectory, "configuration.json");

    this.#partition = new SecureJsonPartition({
      createInitial: () => withDigest({
        configuration: {
          dataRoot: path.join(root, ".cognition-tree"),
          listenMode: "loopback",
          maxAuditEntries: 1_000,
          port: 3_001,
          publicOrigin: null,
          repositoryHostRoot: null,
        },
        formatVersion,
        ownerCredentialDigest: null,
        ownerCredentialVersion: 1,
        sessionSigningKey: randomBytes(32).toString("base64url"),
        version: 1,
      }),
      directory: this.#controlDirectory,
      fileName: "configuration.json",
      name: "bootstrap configuration",
      parse: parseState,
    });
  }

  async recover(dataRoot: string | null) {
    const resolvedDataRoot = dataRoot === null
      ? path.join(this.#projectRoot, ".cognition-tree")
      : absolutePathOrNull(dataRoot, "dataRoot");

    if (!resolvedDataRoot) {
      throw new SystemConfigurationValidationError(
        "Recovery data root must be an absolute path.",
      );
    }
    const dataRootStats = await lstat(resolvedDataRoot);

    if (!dataRootStats.isDirectory() || dataRootStats.isSymbolicLink()) {
      throw new SystemConfigurationValidationError(
        "Recovery data root must be an existing regular directory.",
      );
    }
    await mkdir(this.#controlDirectory, { mode: 0o700, recursive: true });
    await chmod(this.#controlDirectory, 0o700);
    const state = withDigest({
      configuration: {
        dataRoot: resolvedDataRoot,
        listenMode: "loopback",
        maxAuditEntries: 1_000,
        port: 3_001,
        publicOrigin: null,
        repositoryHostRoot: null,
      },
      formatVersion,
      ownerCredentialDigest: null,
      ownerCredentialVersion: 1,
      sessionSigningKey: randomBytes(32).toString("base64url"),
      version: 1,
    });

    await replaceFileDurably(
      this.#file,
      `${serializeJsonIteratively(state, {
        indent: 2,
        sortObjectKeys: true,
      })}\n`,
      { hiddenTemporaryFile: true },
    );
  }

  readSnapshot() {
    return this.#partition.read(project);
  }

  update(
    baseRevision: string,
    input: SystemConfigurationInput,
  ) {
    return this.#partition.mutate((state) => {
      assertRevision(state, baseRevision);
      const configuration = parseConfiguration({
        ...input,
        dataRoot: state.configuration.dataRoot,
      });

      if (configuration.listenMode === "lan" &&
          state.ownerCredentialDigest === null) {
        throw new SystemConfigurationValidationError(
          "LAN access requires an owner credential.",
        );
      }
      state.configuration = configuration;
      updateStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  rotateOwnerCredential(baseRevision: string) {
    return this.#partition.mutate((state) => {
      assertRevision(state, baseRevision);
      const secret = `ctn_owner_${randomBytes(32).toString("base64url")}`;

      state.ownerCredentialDigest = credentialDigest(secret);
      state.ownerCredentialVersion += 1;
      updateStateDigest(state);
      return {
        changed: true,
        result: { configuration: project(state), secret },
      };
    });
  }

  clearOwnerCredential(baseRevision: string) {
    return this.#partition.mutate((state) => {
      assertRevision(state, baseRevision);
      if (state.configuration.listenMode !== "loopback") {
        throw new SystemConfigurationValidationError(
          "Owner credential cannot be cleared while LAN access is configured.",
        );
      }
      state.ownerCredentialDigest = null;
      state.ownerCredentialVersion += 1;
      updateStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  setDataRoot(baseRevision: string, dataRoot: string) {
    return this.#partition.mutate((state) => {
      assertRevision(state, baseRevision);
      const resolved = absolutePathOrNull(dataRoot, "dataRoot");

      if (!resolved) throw new SystemConfigurationValidationError(
        "Data root must be an absolute path.",
      );
      state.configuration = { ...state.configuration, dataRoot: resolved };
      updateStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  authenticateOwnerSecret(secret: string) {
    return this.#partition.read((state) => {
      if (!state.ownerCredentialDigest) return false;
      const expected = Buffer.from(state.ownerCredentialDigest, "hex");
      const presented = Buffer.from(credentialDigest(secret), "hex");

      return expected.length === presented.length &&
        timingSafeEqual(expected, presented);
    });
  }

  createOwnerSession(now = new Date()) {
    return this.#partition.read((state) => {
      if (!state.ownerCredentialDigest) {
        throw new SystemConfigurationValidationError(
          "Owner credential is not configured.",
        );
      }
      const payload = Buffer.from(JSON.stringify({
        credentialVersion: state.ownerCredentialVersion,
        expiresAt: now.getTime() + ownerSessionTtlMilliseconds,
      }), "utf8").toString("base64url");
      const signature = createHmac(
        "sha256",
        Buffer.from(state.sessionSigningKey, "base64url"),
      ).update(payload, "utf8").digest("base64url");

      return `${payload}.${signature}`;
    });
  }

  verifyOwnerSession(session: string, now = new Date()) {
    return this.#partition.read((state) => {
      const [payload, presentedSignature, extra] = session.split(".");

      if (!payload || !presentedSignature || extra !== undefined ||
          !state.ownerCredentialDigest) return false;
      const expectedSignature = createHmac(
        "sha256",
        Buffer.from(state.sessionSigningKey, "base64url"),
      ).update(payload, "utf8").digest();
      let presented: Buffer;

      try {
        presented = Buffer.from(presentedSignature, "base64url");
      } catch {
        return false;
      }
      if (expectedSignature.length !== presented.length ||
          !timingSafeEqual(expectedSignature, presented)) return false;
      try {
        const value = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Record<string, unknown>;

        return value.credentialVersion === state.ownerCredentialVersion &&
          typeof value.expiresAt === "number" &&
          Number.isSafeInteger(value.expiresAt) &&
          value.expiresAt > now.getTime();
      } catch {
        return false;
      }
    });
  }
}
