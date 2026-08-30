// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readBoundedUtf8File } from "./boundedFile.ts";

export const cliMaximumCredentialFileBytes = 1024 * 1024;
export const cliMaximumTrustedClientSecretCharacters = 256;

export function validateCliTrustedClientSecret(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^ctt_[A-Za-z0-9_-]+$/.test(value) ||
    value.length > cliMaximumTrustedClientSecretCharacters
  ) {
    throw new Error("CLI trusted-client secret is invalid");
  }
  return value;
}

export type CliCredentialProfile = {
  name: string;
  origin: string;
  secret: string;
};

export type CliCredentialState = {
  defaultProfile: string | null;
  formatVersion: 1;
  profiles: CliCredentialProfile[];
};

const initialState = (): CliCredentialState => ({
  defaultProfile: null,
  formatVersion: 1,
  profiles: [],
});

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseState(value: unknown): CliCredentialState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLI credential file must contain an object");
  }
  const record = value as Record<string, unknown>;

  if (
    Object.keys(record).sort().join(",") !==
      "defaultProfile,formatVersion,profiles" ||
    record.formatVersion !== 1 ||
    (record.defaultProfile !== null && typeof record.defaultProfile !== "string") ||
    !Array.isArray(record.profiles)
  ) {
    throw new Error("CLI credential file has an unsupported format");
  }
  const profiles = record.profiles.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`CLI credential profile ${index} is invalid`);
    }
    const profile = value as Record<string, unknown>;

    if (
      Object.keys(profile).sort().join(",") !== "name,origin,secret" ||
      typeof profile.name !== "string" || !profile.name ||
      typeof profile.origin !== "string" || !profile.origin
    ) {
      throw new Error(`CLI credential profile ${index} is invalid`);
    }
    return {
      name: profile.name,
      origin: profile.origin,
      secret: validateCliTrustedClientSecret(profile.secret),
    };
  });
  if (new Set(profiles.map(({ name }) => name)).size !== profiles.length) {
    throw new Error("CLI credential profile names must be unique");
  }
  if (
    record.defaultProfile !== null &&
    !profiles.some(({ name }) => name === record.defaultProfile)
  ) {
    throw new Error("CLI default profile does not exist");
  }
  return {
    defaultProfile: record.defaultProfile,
    formatVersion: 1,
    profiles,
  };
}

async function assertSecureDirectory(directory: string) {
  const stats = await lstat(directory);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`CLI credential path is not a regular directory: ${directory}`);
  }
  if ((stats.mode & 0o777) !== 0o700) await chmod(directory, 0o700);
}

async function ensureDirectory(directory: string) {
  const configurationRoot = path.dirname(path.dirname(directory));

  await mkdir(configurationRoot, { mode: 0o700, recursive: true });
  const segments = [path.join(configurationRoot, "cognition-tree"), directory];

  for (const segment of segments) {
    try {
      await mkdir(segment, { mode: 0o700 });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
    await assertSecureDirectory(segment);
  }
}

export function defaultCredentialFile() {
  return path.join(
    os.homedir(),
    ".config",
    "cognition-tree",
    "cli-v1",
    "credentials.json",
  );
}

export class CliCredentialStore {
  readonly #directory: string;
  readonly #file: string;

  constructor(file = defaultCredentialFile()) {
    this.#file = path.resolve(file);
    this.#directory = path.dirname(this.#file);
  }

  async read(): Promise<CliCredentialState> {
    await ensureDirectory(this.#directory);
    let handle;

    try {
      handle = await open(
        this.#file,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (isMissing(error)) return initialState();
      throw error;
    }
    try {
      const stats = await handle.stat();

      if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
        throw new Error("CLI credential file must be a regular 0600 file");
      }
      if (stats.size > cliMaximumCredentialFileBytes) {
        throw new Error("CLI credential file exceeds the size limit");
      }
      return parseState(JSON.parse(await readBoundedUtf8File(
        handle,
        cliMaximumCredentialFileBytes,
        "CLI credential file",
      )) as unknown);
    } finally {
      await handle.close();
    }
  }

  async write(state: CliCredentialState) {
    const parsed = parseState(state);
    const source = `${JSON.stringify(parsed, null, 2)}\n`;

    if (Buffer.byteLength(source) > cliMaximumCredentialFileBytes) {
      throw new Error("CLI credential file exceeds the size limit");
    }

    await ensureDirectory(this.#directory);
    try {
      const current = await lstat(this.#file);

      if (current.isSymbolicLink() || !current.isFile()) {
        throw new Error("CLI credential file must not be a symlink");
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const temporary = path.join(
      this.#directory,
      `.credentials-${randomUUID()}.tmp`,
    );
    let handle;

    try {
      handle = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW |
          constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(source, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, this.#file);
      const directoryHandle = await open(this.#directory, constants.O_RDONLY);

      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
