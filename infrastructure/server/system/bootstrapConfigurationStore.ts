// SPDX-License-Identifier: GPL-3.0-or-later

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  SystemConfigurationConflictError,
  SystemConfigurationValidationError,
} from "../../../application/system/systemConfiguration.ts";
import type {
  SystemConfiguration,
  SystemConfigurationInput,
} from "../../../application/system/systemConfiguration.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { hasFileSystemErrorCode } from "../persistence/fileSystemError.ts";
import { replaceFileDurably } from "../persistence/fileSystemPersistence.ts";
import {
  SecureJsonPartition,
  type SecureStateFileReplacer,
} from "../state/secureJsonPartition.ts";
import {
  consumeBootstrapFormatRewrite,
  createInitialBootstrapState,
  parseBootstrapState,
  parseSystemConfiguration,
  updateBootstrapStateDigest,
  type BootstrapState,
} from "./bootstrapConfigurationStateCodec.ts";
import {
  activateOwnerCredentialRotation,
  authenticateOwnerCredentialSecret,
  clearOwnerCredential,
  createOwnerCredentialSecret,
  matchesActiveOwnerCredentialVersion,
  prepareOwnerCredentialRotation,
  projectOwnerCredentialStatus,
  readActiveOwnerCredentialVersion,
} from "./ownerCredential.ts";

const ownerSessionTtlMilliseconds = 12 * 60 * 60 * 1_000;

export type BootstrapConfigurationSnapshot = Readonly<{
  configuration: SystemConfiguration;
  ownerCredentialConfigured: boolean;
  ownerCredentialRotationPending: boolean;
  revision: `sha256:${string}`;
  version: number;
}>;

export type BootstrapConfigurationStoreOptions = Readonly<{
  createOwnerCredentialRotationId?: () => string;
  createOwnerCredentialSecret?: () => string;
  now?: () => Date;
  replaceConfigurationFile?: SecureStateFileReplacer;
}>;

export type BootstrapOwnerCredentialActivation = Readonly<{
  configuration: BootstrapConfigurationSnapshot;
  ownerSession: string;
}>;

function absolutePathOrNull(value: unknown, label: string) {
  if (value === null) return null;
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new SystemConfigurationValidationError(
      `${label} must be null or an absolute path.`,
    );
  }
  return path.normalize(value);
}

function initialConfiguration(root: string): SystemConfiguration {
  return {
    dataRoot: path.join(root, ".cognition-tree"),
    listenMode: "loopback",
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  };
}

function project(state: BootstrapState): BootstrapConfigurationSnapshot {
  const credential = projectOwnerCredentialStatus(state.ownerCredential);

  return {
    configuration: { ...state.configuration },
    ownerCredentialConfigured: credential.configured,
    ownerCredentialRotationPending: credential.rotationPending,
    revision: state.digest,
    version: state.version,
  };
}

function assertRevision(state: BootstrapState, baseRevision: string) {
  if (baseRevision !== state.digest) {
    throw new SystemConfigurationConflictError(state.digest);
  }
}

function createOwnerSession(state: BootstrapState, now: Date) {
  const credentialVersion = readActiveOwnerCredentialVersion(
    state.ownerCredential,
  );

  if (credentialVersion === null) {
    throw new SystemConfigurationValidationError(
      "Owner credential is not configured.",
    );
  }
  const payload = Buffer.from(JSON.stringify({
    credentialVersion,
    expiresAt: now.getTime() + ownerSessionTtlMilliseconds,
  }), "utf8").toString("base64url");
  const signature = createHmac(
    "sha256",
    Buffer.from(state.sessionSigningKey, "base64url"),
  ).update(payload, "utf8").digest("base64url");

  return `${payload}.${signature}`;
}

export class BootstrapConfigurationStore {
  readonly #controlDirectory: string;
  readonly #createOwnerCredentialRotationId: () => string;
  readonly #createOwnerCredentialSecret: () => string;
  readonly #file: string;
  readonly #now: () => Date;
  readonly #partition: SecureJsonPartition<BootstrapState>;
  readonly #projectRoot: string;

  constructor(
    projectRoot: string,
    {
      createOwnerCredentialRotationId = randomUUID,
      createOwnerCredentialSecret: createCredentialSecret =
        createOwnerCredentialSecret,
      now = () => new Date(),
      replaceConfigurationFile,
    }: BootstrapConfigurationStoreOptions = {},
  ) {
    const root = path.resolve(projectRoot);

    this.#projectRoot = root;
    this.#controlDirectory = path.join(root, ".cognition-tree", "bootstrap-v1");
    this.#file = path.join(this.#controlDirectory, "configuration.json");
    this.#createOwnerCredentialRotationId = createOwnerCredentialRotationId;
    this.#createOwnerCredentialSecret = createCredentialSecret;
    this.#now = now;
    this.#partition = new SecureJsonPartition({
      createInitial: () => createInitialBootstrapState(
        initialConfiguration(root),
        randomBytes(32).toString("base64url"),
      ),
      directory: this.#controlDirectory,
      fileName: "configuration.json",
      name: "bootstrap configuration",
      parse: parseBootstrapState,
      ...(replaceConfigurationFile
        ? { replaceFile: replaceConfigurationFile }
        : {}),
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
    let dataRootStats: Awaited<ReturnType<typeof lstat>>;

    try {
      dataRootStats = await lstat(resolvedDataRoot);
    } catch (error) {
      if (
        hasFileSystemErrorCode(error, "ENOENT") ||
        hasFileSystemErrorCode(error, "ENOTDIR")
      ) {
        throw new SystemConfigurationValidationError(
          "Recovery data root must be an existing non-symbolic directory.",
        );
      }
      throw error;
    }

    if (!dataRootStats.isDirectory() || dataRootStats.isSymbolicLink()) {
      throw new SystemConfigurationValidationError(
        "Recovery data root must be an existing non-symbolic directory.",
      );
    }
    await mkdir(this.#controlDirectory, { mode: 0o700, recursive: true });
    await chmod(this.#controlDirectory, 0o700);
    const state = createInitialBootstrapState(
      { ...initialConfiguration(this.#projectRoot), dataRoot: resolvedDataRoot },
      randomBytes(32).toString("base64url"),
    );

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
    return this.#read(project);
  }

  update(
    baseRevision: string,
    input: SystemConfigurationInput,
  ) {
    return this.#partition.mutate((state) => {
      consumeBootstrapFormatRewrite(state);
      assertRevision(state, baseRevision);
      const configuration = parseSystemConfiguration({
        ...input,
        dataRoot: state.configuration.dataRoot,
      });

      if (
        configuration.listenMode === "lan" &&
        !projectOwnerCredentialStatus(state.ownerCredential).configured
      ) {
        throw new SystemConfigurationValidationError(
          "LAN access requires an active owner credential.",
        );
      }
      state.configuration = configuration;
      updateBootstrapStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  prepareOwnerCredentialRotation(baseRevision: string) {
    return this.#partition.mutate((state) => {
      consumeBootstrapFormatRewrite(state);
      assertRevision(state, baseRevision);
      const rotationId = this.#createOwnerCredentialRotationId();
      const secret = this.#createOwnerCredentialSecret();

      state.ownerCredential = prepareOwnerCredentialRotation(
        state.ownerCredential,
        rotationId,
        secret,
      );
      updateBootstrapStateDigest(state);
      return {
        changed: true,
        result: { configuration: project(state), rotationId, secret },
      };
    });
  }

  activateOwnerCredentialRotation(
    baseRevision: string,
    rotationId: string,
    secret: string,
  ) {
    return this.#partition.mutate((state) => {
      consumeBootstrapFormatRewrite(state);
      assertRevision(state, baseRevision);
      state.ownerCredential = activateOwnerCredentialRotation(
        state.ownerCredential,
        rotationId,
        secret,
      );
      updateBootstrapStateDigest(state);
      return {
        changed: true,
        result: {
          configuration: project(state),
          ownerSession: createOwnerSession(state, this.#now()),
        } satisfies BootstrapOwnerCredentialActivation,
      };
    });
  }

  clearOwnerCredential(baseRevision: string) {
    return this.#partition.mutate((state) => {
      consumeBootstrapFormatRewrite(state);
      assertRevision(state, baseRevision);
      if (state.configuration.listenMode !== "loopback") {
        throw new SystemConfigurationValidationError(
          "Owner credential cannot be cleared while LAN access is configured.",
        );
      }
      state.ownerCredential = clearOwnerCredential(state.ownerCredential);
      updateBootstrapStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  setDataRoot(baseRevision: string, dataRoot: string) {
    return this.#partition.mutate((state) => {
      consumeBootstrapFormatRewrite(state);
      assertRevision(state, baseRevision);
      const resolved = absolutePathOrNull(dataRoot, "dataRoot");

      if (!resolved) throw new SystemConfigurationValidationError(
        "Data root must be an absolute path.",
      );
      state.configuration = { ...state.configuration, dataRoot: resolved };
      updateBootstrapStateDigest(state);
      return { changed: true, result: project(state) };
    });
  }

  createOwnerSessionForSecret(secret: string, now = this.#now()) {
    return this.#read((state) => {
      if (!authenticateOwnerCredentialSecret(state.ownerCredential, secret)) {
        return null;
      }
      return createOwnerSession(state, now);
    });
  }

  verifyOwnerSession(session: string, now = this.#now()) {
    return this.#read((state) => {
      const [payload, presentedSignature, extra] = session.split(".");

      if (
        !payload || !presentedSignature || extra !== undefined ||
        readActiveOwnerCredentialVersion(state.ownerCredential) === null
      ) return false;
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
      if (
        expectedSignature.length !== presented.length ||
        !timingSafeEqual(expectedSignature, presented)
      ) return false;
      try {
        const value = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Record<string, unknown>;

        return matchesActiveOwnerCredentialVersion(
          state.ownerCredential,
          value.credentialVersion,
        ) &&
          typeof value.expiresAt === "number" &&
          Number.isSafeInteger(value.expiresAt) &&
          value.expiresAt > now.getTime();
      } catch {
        return false;
      }
    });
  }

  #read<Result>(projectState: (state: BootstrapState) => Result) {
    return this.#partition.mutate((state) => ({
      changed: consumeBootstrapFormatRewrite(state),
      result: projectState(state),
    }));
  }
}
