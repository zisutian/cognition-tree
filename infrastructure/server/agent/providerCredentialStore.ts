// SPDX-License-Identifier: GPL-3.0-or-later

import {
  lstat,
  readFile,
  readdir,
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
const referencePattern = /^providers\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/api-key-v([1-9][0-9]*)\.json$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

type ApiKeyCredential = Readonly<{
  apiKey: string;
  formatVersion: typeof credentialFormatVersion;
  providerId: string;
  type: "api-key";
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

function credentialDigest(credential: ApiKeyCredential): `sha256:${string}` {
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

function parseReference(reference: AgentCredentialReference) {
  const match = referencePattern.exec(reference.reference);

  if (!match || !digestPattern.test(reference.digest)) {
    throw new Error("Agent credential reference is invalid.");
  }
  const version = positiveInteger(reference.version, "Agent credential version");

  if (Number(match[2]) !== version) {
    throw new Error("Agent credential reference version does not match its path.");
  }
  return { providerId: match[1]!, version };
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
    return (await this.#read(reference)).apiKey;
  }

  async remove(reference: AgentCredentialReference) {
    const { providerId } = parseReference(reference);
    const file = path.join(this.#root, reference.reference);
    const providerDirectory = path.join(this.#root, "providers", providerId);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(providerDirectory);
    const stats = await lstat(file);

    if (!isSecureRegularFile(stats)) {
      throw new Error("Agent credential file permissions or type are invalid.");
    }
    await unlink(file);
    await fsyncDirectory(providerDirectory);
    if ((await readdir(providerDirectory)).length === 0) {
      await rmdir(providerDirectory);
      await fsyncDirectory(path.dirname(providerDirectory));
    }
  }

  async #read(reference: AgentCredentialReference) {
    const { providerId, version } = parseReference(reference);
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
}
