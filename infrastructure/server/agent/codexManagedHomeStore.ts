// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  opendir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  assertSecureStateDirectory,
  ensureSecureStateDirectory,
  fsyncDirectory,
  hasFileSystemErrorCode,
  isSecureRegularFile,
} from "../state/index.ts";
import {
  agentCodexManagedHomeReference,
  assertAgentManagedCredentialIdentity,
} from "./credentialManifest.ts";

export type CodexManagedHomeIdentity = Readonly<{
  loginId: string;
  providerId: string;
  version: number;
}>;

export class CodexManagedHomeStore {
  readonly #credentialPartitionRoot: string;

  constructor(credentialPartitionRoot: string) {
    this.#credentialPartitionRoot = path.resolve(credentialPartitionRoot);
  }

  async prepare(identity: CodexManagedHomeIdentity) {
    const { home, homeReference } = this.#resolve(identity);

    try {
      await lstat(home);
      throw new Error("Codex managed credential staging home already exists.");
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
    }
    await ensureSecureStateDirectory(home);
    return { home, homeReference };
  }

  async activate(identity: CodexManagedHomeIdentity) {
    const { home, homeReference } = this.#resolve(identity);

    await this.#sealTree(home);
    await this.#assertAuthFile(
      home,
      "Codex device login did not create a secure auth file.",
    );
    return { home, homeReference };
  }

  async resolveActive(identity: CodexManagedHomeIdentity) {
    const { home } = this.#resolve(identity);

    await assertSecureStateDirectory(home);
    await this.#assertAuthFile(
      home,
      "Codex managed authentication is unavailable.",
    );
    return home;
  }

  async assertDirectory(identity: CodexManagedHomeIdentity) {
    await assertSecureStateDirectory(this.#resolve(identity).home);
  }

  async seal(identity: CodexManagedHomeIdentity) {
    await this.#sealTree(this.#resolve(identity).home);
  }

  async remove(identity: CodexManagedHomeIdentity) {
    const { home } = this.#resolve(identity);

    try {
      await this.#sealTree(home);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) return;
      throw error;
    }
    await rm(home, { recursive: true });
    await fsyncDirectory(path.dirname(home));
  }

  #resolve(identity: CodexManagedHomeIdentity) {
    assertAgentManagedCredentialIdentity(
      identity.providerId,
      identity.version,
      identity.loginId,
    );
    const homeReference = agentCodexManagedHomeReference(
      identity.providerId,
      identity.version,
      identity.loginId,
    );

    return {
      home: path.join(this.#credentialPartitionRoot, homeReference),
      homeReference,
    };
  }

  async #assertAuthFile(home: string, message: string) {
    if (!isSecureRegularFile(await lstat(path.join(home, "auth.json")))) {
      throw new Error(message);
    }
  }

  async #sealTree(directory: string): Promise<void> {
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
        await this.#sealTree(entryPath);
      } else if (entryStats.isFile()) {
        await chmod(entryPath, 0o600);
      } else {
        throw new Error("Codex managed home contains an unsupported entry.");
      }
    }
    await chmod(directory, 0o700);
  }
}
