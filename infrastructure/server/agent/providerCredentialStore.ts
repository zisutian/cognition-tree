// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  opendir,
  readFile,
  readdir,
  rm,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  assertSecureStateDirectory,
  ensureSecureStateDirectory,
  fsyncDirectory,
  isSecureRegularFile,
  writeFileDurably,
} from "../state/secureStateFileSystem.ts";
import { createStateDigest } from "../state/stateDigest.ts";
import { assertStateFields, requireStateRecord } from "../state/secureJsonPartition.ts";

const credentialFormatVersion = 1;
const providerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const apiKeyReferencePattern = /^providers\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/api-key-v([1-9][0-9]*)\.json$/;
const managedReferencePattern = /^providers\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/codex-managed-v([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

type ApiKeyCredential = Readonly<{
  apiKey: string;
  formatVersion: typeof credentialFormatVersion;
  providerId: string;
  type: "api-key";
  version: number;
}>;

type CodexManagedCredential = Readonly<{
  formatVersion: typeof credentialFormatVersion;
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

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function positiveInteger(value: unknown, pathLabel: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${pathLabel} must be a positive integer.`);
  }
  return value as number;
}

function assertManagedIdentity(
  providerId: string,
  version: number,
  loginId: string,
) {
  if (!providerIdPattern.test(providerId) || !providerIdPattern.test(loginId)) {
    throw new Error("Codex managed credential identity is invalid.");
  }
  positiveInteger(version, "Codex managed credential version");
}

function credentialDigest(
  credential: ApiKeyCredential | CodexManagedCredential,
): `sha256:${string}` {
  return `sha256:${createStateDigest(serializeJsonIteratively(credential, {
    sortObjectKeys: true,
  }))}`;
}

function parseCredential(value: unknown): ApiKeyCredential {
  const record = requireStateRecord(value, "Agent provider credential");

  assertStateFields(record, [
    "apiKey", "formatVersion", "providerId", "type", "version",
  ], "Agent provider credential");
  if (record.formatVersion !== credentialFormatVersion || record.type !== "api-key") {
    throw new Error("Agent provider credential has an invalid format.");
  }
  if (typeof record.apiKey !== "string" || record.apiKey.length === 0) {
    throw new Error("Agent provider credential API key is invalid.");
  }
  if (typeof record.providerId !== "string" ||
      !providerIdPattern.test(record.providerId)) {
    throw new Error("Agent provider credential provider id is invalid.");
  }
  return {
    apiKey: record.apiKey,
    formatVersion: credentialFormatVersion,
    providerId: record.providerId,
    type: "api-key",
    version: positiveInteger(record.version, "Agent provider credential version"),
  };
}

function parseManagedCredential(value: unknown): CodexManagedCredential {
  const record = requireStateRecord(value, "Codex managed credential");

  assertStateFields(record, [
    "formatVersion", "homeReference", "providerId", "type", "version",
  ], "Codex managed credential");
  if (record.formatVersion !== credentialFormatVersion ||
      record.type !== "chatgpt-device-code" ||
      typeof record.providerId !== "string" ||
      !providerIdPattern.test(record.providerId) ||
      typeof record.homeReference !== "string") {
    throw new Error("Codex managed credential has an invalid format.");
  }
  return {
    formatVersion: credentialFormatVersion,
    homeReference: record.homeReference,
    providerId: record.providerId,
    type: "chatgpt-device-code",
    version: positiveInteger(record.version, "Codex managed credential version"),
  };
}

function parseReference(reference: AgentCredentialReference) {
  const apiKeyMatch = apiKeyReferencePattern.exec(reference.reference);
  const managedMatch = managedReferencePattern.exec(reference.reference);
  const match = apiKeyMatch ?? managedMatch;

  if (!match || !digestPattern.test(reference.digest)) {
    throw new Error("Agent credential reference is invalid.");
  }
  const version = positiveInteger(reference.version, "Agent credential version");

  if (Number(match[2]) !== version) {
    throw new Error("Agent credential reference version does not match its path.");
  }
  return {
    kind: apiKeyMatch ? "api-key" as const : "chatgpt-device-code" as const,
    loginId: managedMatch?.[3] ?? null,
    providerId: match[1]!,
    version,
  };
}

export function validateAgentCredentialReference(
  reference: AgentCredentialReference,
) {
  parseReference(reference);
  return reference;
}

export class AgentProviderCredentialStore {
  readonly #root: string;

  constructor(stateDirectory: string) {
    this.#root = path.join(
      path.resolve(stateDirectory),
      "agent-auth-v1",
    );
  }

  async writeApiKey(
    providerId: string,
    apiKey: string,
    version: number,
  ): Promise<AgentCredentialReference> {
    if (!providerIdPattern.test(providerId) || apiKey.length === 0) {
      throw new Error("Agent API key credential input is invalid.");
    }
    positiveInteger(version, "Agent credential version");
    const providersDirectory = path.join(this.#root, "providers");
    const providerDirectory = path.join(providersDirectory, providerId);

    await ensureSecureStateDirectory(this.#root);
    await ensureSecureStateDirectory(providersDirectory);
    await ensureSecureStateDirectory(providerDirectory);
    const credential: ApiKeyCredential = {
      apiKey,
      formatVersion: credentialFormatVersion,
      providerId,
      type: "api-key",
      version,
    };
    const reference = `providers/${providerId}/api-key-v${version}.json`;
    const file = path.join(this.#root, reference);
    const result = {
      digest: credentialDigest(credential),
      reference,
      version,
    } as const;

    try {
      const existing = await this.#read(result);

      if (existing.apiKey !== apiKey) {
        throw new Error("Agent credential version already contains different data.");
      }
      return result;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await writeFileDurably(
      file,
      `${serializeJsonIteratively(credential, {
        indent: 2,
        sortObjectKeys: true,
      })}\n`,
    );
    await fsyncDirectory(providerDirectory);
    return result;
  }

  async readApiKey(reference: AgentCredentialReference) {
    if (parseReference(reference).kind !== "api-key") {
      throw new Error("Agent credential is not an API key.");
    }
    return (await this.#read(reference)).apiKey;
  }

  async prepareCodexManagedHome(
    providerId: string,
    version: number,
    loginId: string,
  ) {
    assertManagedIdentity(providerId, version, loginId);
    const providersDirectory = path.join(this.#root, "providers");
    const providerDirectory = path.join(providersDirectory, providerId);
    const homeReference =
      `providers/${providerId}/codex-home-v${version}-${loginId}`;
    const home = path.join(this.#root, homeReference);

    await ensureSecureStateDirectory(this.#root);
    await ensureSecureStateDirectory(providersDirectory);
    await ensureSecureStateDirectory(providerDirectory);
    try {
      await lstat(home);
      throw new Error("Codex managed credential staging home already exists.");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await ensureSecureStateDirectory(home);
    return { home, homeReference };
  }

  async activateCodexManagedHome(
    providerId: string,
    version: number,
    loginId: string,
  ): Promise<AgentCredentialReference> {
    assertManagedIdentity(providerId, version, loginId);
    const homeReference =
      `providers/${providerId}/codex-home-v${version}-${loginId}`;
    const home = path.join(this.#root, homeReference);

    await this.#sealManagedHome(home);
    const authFile = path.join(home, "auth.json");

    if (!isSecureRegularFile(await lstat(authFile))) {
      throw new Error("Codex device login did not create a secure auth file.");
    }
    const credential: CodexManagedCredential = {
      formatVersion: credentialFormatVersion,
      homeReference,
      providerId,
      type: "chatgpt-device-code",
      version,
    };
    const reference =
      `providers/${providerId}/codex-managed-v${version}-${loginId}.json`;
    const result = {
      digest: credentialDigest(credential),
      reference,
      version,
    } as const;
    const file = path.join(this.#root, reference);

    await writeFileDurably(file, `${serializeJsonIteratively(credential, {
      indent: 2,
      sortObjectKeys: true,
    })}\n`);
    await fsyncDirectory(path.dirname(file));
    return result;
  }

  async resolveCodexManagedHome(reference: AgentCredentialReference) {
    const parsed = parseReference(reference);

    if (parsed.kind !== "chatgpt-device-code") {
      throw new Error("Agent credential is not Codex managed authentication.");
    }
    const file = path.join(this.#root, reference.reference);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(
      path.join(this.#root, "providers", parsed.providerId),
    );
    if (!isSecureRegularFile(await lstat(file))) {
      throw new Error("Codex managed credential manifest is not secure.");
    }
    const credential = parseManagedCredential(
      JSON.parse(await readFile(file, "utf8")),
    );

    if (credential.providerId !== parsed.providerId ||
        credential.version !== parsed.version ||
        credentialDigest(credential) !== reference.digest) {
      throw new Error("Codex managed credential reference verification failed.");
    }
    const expectedHomeReference =
      `providers/${parsed.providerId}/codex-home-v${parsed.version}-${parsed.loginId}`;

    if (credential.homeReference !== expectedHomeReference) {
      throw new Error("Codex managed credential home reference is invalid.");
    }
    const home = path.join(this.#root, credential.homeReference);

    await assertSecureStateDirectory(home);
    if (!isSecureRegularFile(await lstat(path.join(home, "auth.json")))) {
      throw new Error("Codex managed authentication is unavailable.");
    }
    return home;
  }

  async removeCodexStagingHome(
    providerId: string,
    version: number,
    loginId: string,
  ) {
    assertManagedIdentity(providerId, version, loginId);
    const providerDirectory = path.join(
      this.#root,
      "providers",
      providerId,
    );
    const home = path.join(
      providerDirectory,
      `codex-home-v${version}-${loginId}`,
    );

    await this.#removeManagedTree(home);
    if ((await readdir(providerDirectory)).length === 0) {
      await rmdir(providerDirectory);
      await fsyncDirectory(path.dirname(providerDirectory));
    }
  }

  async remove(reference: AgentCredentialReference) {
    const { kind, loginId, providerId, version } = parseReference(reference);
    const file = path.join(this.#root, reference.reference);
    const providerDirectory = path.join(this.#root, "providers", providerId);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(providerDirectory);
    const stats = await lstat(file);

    if (!isSecureRegularFile(stats)) {
      throw new Error("Agent credential file permissions or type are invalid.");
    }
    if (kind === "chatgpt-device-code") {
      await this.#removeManagedTree(path.join(
        this.#root,
        `providers/${providerId}/codex-home-v${version}-${loginId}`,
      ));
    }
    await unlink(file);
    await fsyncDirectory(providerDirectory);
    if ((await readdir(providerDirectory)).length === 0) {
      await rmdir(providerDirectory);
      await fsyncDirectory(path.dirname(providerDirectory));
    }
  }

  async #read(reference: AgentCredentialReference) {
    const { kind, providerId, version } = parseReference(reference);

    if (kind !== "api-key") throw new Error("Agent credential is not an API key.");
    const file = path.join(this.#root, reference.reference);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(path.join(this.#root, "providers", providerId));
    const stats = await lstat(file);

    if (!isSecureRegularFile(stats)) {
      throw new Error("Agent credential file permissions or type are invalid.");
    }
    const credential = parseCredential(JSON.parse(await readFile(file, "utf8")));

    if (credential.providerId !== providerId || credential.version !== version ||
        credentialDigest(credential) !== reference.digest) {
      throw new Error("Agent credential reference verification failed.");
    }
    return credential;
  }

  async #sealManagedHome(directory: string): Promise<void> {
    const stats = await lstat(directory);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Codex managed home is not a regular directory.");
    }
    const entries = await opendir(directory);

    for await (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const entryStats = await lstat(entryPath);

      if (entryStats.isSymbolicLink()) {
        throw new Error("Codex managed home cannot contain symbolic links.");
      }
      if (entryStats.isDirectory()) {
        await this.#sealManagedHome(entryPath);
      } else if (entryStats.isFile()) {
        await chmod(entryPath, 0o600);
      } else {
        throw new Error("Codex managed home contains an unsupported entry.");
      }
    }
    await chmod(directory, 0o700);
  }

  async #removeManagedTree(directory: string) {
    try {
      await this.#sealManagedHome(directory);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    await rm(directory, { recursive: true });
    await fsyncDirectory(path.dirname(directory));
  }
}
