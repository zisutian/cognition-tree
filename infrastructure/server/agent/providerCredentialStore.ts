// SPDX-License-Identifier: GPL-3.0-or-later

import {
  lstat,
  readdir,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  assertSecureStateDirectory,
  ensureSecureStateDirectory,
  fsyncDirectory,
  hasFileSystemErrorCode,
  isSecureRegularFile,
  readSecureFileUtf8,
  secureStateDirectoryExists,
  writeFileDurably,
} from "../state/secureStateFileSystem.ts";
import {
  agentApiKeyCredentialReference,
  agentCodexManagedCredentialReference,
  agentCodexManagedHomeReference,
  agentCredentialDigest,
  agentCredentialEntryReference,
  agentCredentialFormatVersion,
  assertAgentManagedCredentialIdentity,
  isAgentCredentialProviderId,
  maximumAgentCredentialManifestBytes,
  parseAgentCredentialEntryName,
  parseAgentCredentialManifestJson,
  parseAgentCredentialReference,
  parseApiKeyCredentialManifest,
  parseCodexManagedCredentialManifest,
  serializeAgentCredentialManifest,
  type AgentCredentialReference,
  type ApiKeyCredentialManifest,
  type CodexManagedCredentialManifest,
} from "./credentialManifest.ts";
import {
  CodexManagedHomeStore,
  type CodexManagedHomeIdentity,
} from "./codexManagedHomeStore.ts";

async function readCredentialManifest(file: string) {
  return parseAgentCredentialManifestJson(await readSecureFileUtf8(
    file,
    maximumAgentCredentialManifestBytes,
    "Agent credential file",
  ));
}

export class AgentProviderCredentialStore {
  readonly #managedHomes: CodexManagedHomeStore;
  readonly #root: string;

  constructor(stateDirectory: string) {
    this.#root = path.join(
      path.resolve(stateDirectory),
      "agent-auth-v1",
    );
    this.#managedHomes = new CodexManagedHomeStore(this.#root);
  }

  async writeApiKey(
    providerId: string,
    apiKey: string,
    version: number,
  ): Promise<AgentCredentialReference> {
    if (
      !isAgentCredentialProviderId(providerId) ||
      apiKey.length === 0
    ) {
      throw new Error("Agent API key credential input is invalid.");
    }
    const reference = agentApiKeyCredentialReference(providerId, version);
    const credential: ApiKeyCredentialManifest = {
      apiKey,
      formatVersion: agentCredentialFormatVersion,
      providerId,
      type: "api-key",
      version,
    };
    const credentialSource = serializeAgentCredentialManifest(credential);
    const file = path.join(this.#root, reference);
    const result = {
      digest: agentCredentialDigest(credential),
      reference,
      version,
    } as const;
    const providerDirectory = await this.#ensureProviderPartition(providerId);

    try {
      const existing = await this.#read(result);

      if (existing.apiKey !== apiKey) {
        throw new Error("Agent credential version already contains different data.");
      }
      return result;
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
    }
    await writeFileDurably(file, credentialSource);
    await fsyncDirectory(providerDirectory);
    return result;
  }

  async readApiKey(reference: AgentCredentialReference) {
    if (parseAgentCredentialReference(reference).kind !== "api-key") {
      throw new Error("Agent credential is not an API key.");
    }
    return (await this.#read(reference)).apiKey;
  }

  async prepareCodexManagedHome(
    providerId: string,
    version: number,
    loginId: string,
  ) {
    assertAgentManagedCredentialIdentity(providerId, version, loginId);
    await this.#ensureProviderPartition(providerId);
    return this.#managedHomes.prepare({ loginId, providerId, version });
  }

  async activateCodexManagedHome(
    providerId: string,
    version: number,
    loginId: string,
  ): Promise<AgentCredentialReference> {
    const { homeReference } = await this.#managedHomes.activate({
      loginId,
      providerId,
      version,
    });
    const credential: CodexManagedCredentialManifest = {
      formatVersion: agentCredentialFormatVersion,
      homeReference,
      providerId,
      type: "chatgpt-device-code",
      version,
    };
    const reference = agentCodexManagedCredentialReference(
      providerId,
      version,
      loginId,
    );
    const result = {
      digest: agentCredentialDigest(credential),
      reference,
      version,
    } as const;
    const file = path.join(this.#root, reference);

    await writeFileDurably(
      file,
      serializeAgentCredentialManifest(credential),
    );
    await fsyncDirectory(path.dirname(file));
    return result;
  }

  async resolveCodexManagedHome(reference: AgentCredentialReference) {
    const parsed = parseAgentCredentialReference(reference);

    if (parsed.kind !== "chatgpt-device-code") {
      throw new Error("Agent credential is not Codex managed authentication.");
    }
    const file = path.join(this.#root, reference.reference);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(
      path.join(this.#root, "providers", parsed.providerId),
    );
    const credential = parseCodexManagedCredentialManifest(
      await readCredentialManifest(file),
    );

    if (credential.providerId !== parsed.providerId ||
        credential.version !== parsed.version ||
        agentCredentialDigest(credential) !== reference.digest) {
      throw new Error("Codex managed credential reference verification failed.");
    }
    const expectedHomeReference = agentCodexManagedHomeReference(
      parsed.providerId,
      parsed.version,
      parsed.loginId,
    );

    if (credential.homeReference !== expectedHomeReference) {
      throw new Error("Codex managed credential home reference is invalid.");
    }
    return this.#managedHomes.resolveActive({
      loginId: parsed.loginId,
      providerId: parsed.providerId,
      version: parsed.version,
    });
  }

  async removeCodexStagingHome(
    providerId: string,
    version: number,
    loginId: string,
  ) {
    const providerDirectory = path.join(
      this.#root,
      "providers",
      providerId,
    );
    const credentialFile = path.join(
      this.#root,
      agentCodexManagedCredentialReference(providerId, version, loginId),
    );

    try {
      await lstat(credentialFile);
      throw new Error("Activated Codex credentials cannot be removed as staging.");
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
    }

    await this.#managedHomes.remove({ loginId, providerId, version });
    if ((await readdir(providerDirectory)).length === 0) {
      await rmdir(providerDirectory);
      await fsyncDirectory(path.dirname(providerDirectory));
    }
  }

  async remove(reference: AgentCredentialReference) {
    const { kind, loginId, providerId, version } =
      parseAgentCredentialReference(reference);
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
      await this.#managedHomes.remove({ loginId, providerId, version });
    }
    await unlink(file);
    await fsyncDirectory(providerDirectory);
    if ((await readdir(providerDirectory)).length === 0) {
      await rmdir(providerDirectory);
      await fsyncDirectory(path.dirname(providerDirectory));
    }
  }

  async reconcile(references: readonly AgentCredentialReference[]) {
    const referenced = new Map(references.map((reference) => {
      parseAgentCredentialReference(reference);
      return [reference.reference, reference] as const;
    }));
    const providersDirectory = path.join(this.#root, "providers");

    if (!await secureStateDirectoryExists(this.#root)) {
      if (referenced.size > 0) {
        throw new Error("Agent credential partition is missing.");
      }
      return;
    }
    if (!await secureStateDirectoryExists(providersDirectory)) {
      if (referenced.size > 0) {
        throw new Error("Agent credential providers partition is missing.");
      }
      return;
    }
    for (const reference of referenced.values()) {
      const parsed = parseAgentCredentialReference(reference);

      if (parsed.kind === "api-key") await this.readApiKey(reference);
      else await this.resolveCodexManagedHome(reference);
    }
    const manifests: Array<{
      file: string;
      home: CodexManagedHomeIdentity | null;
      reference: AgentCredentialReference;
    }> = [];
    const homes = new Map<string, CodexManagedHomeIdentity>();
    const providerDirectories: string[] = [];
    const providerEntries = await readdir(providersDirectory, {
      withFileTypes: true,
    });

    for (const providerEntry of providerEntries) {
      if (!providerEntry.isDirectory() ||
          !isAgentCredentialProviderId(providerEntry.name)) {
        throw new Error("Agent credential providers partition is invalid.");
      }
      const providerId = providerEntry.name;
      const providerDirectory = path.join(providersDirectory, providerId);

      await assertSecureStateDirectory(providerDirectory);
      providerDirectories.push(providerDirectory);
      for (const entry of await readdir(providerDirectory, {
        withFileTypes: true,
      })) {
        const entryPath = path.join(providerDirectory, entry.name);
        const parsedEntry = parseAgentCredentialEntryName(entry.name);

        if (entry.isFile() && parsedEntry?.kind === "api-key") {
          const credential = parseApiKeyCredentialManifest(
            await readCredentialManifest(entryPath),
          );
          const { version } = parsedEntry;

          if (credential.providerId !== providerId ||
              credential.version !== version) {
            throw new Error("Agent credential file identity is invalid.");
          }
          manifests.push({
            file: entryPath,
            home: null,
            reference: {
              digest: agentCredentialDigest(credential),
              reference: agentCredentialEntryReference(
                providerId,
                entry.name,
              ),
              version,
            },
          });
          continue;
        }
        if (entry.isFile() && parsedEntry?.kind === "managed") {
          const credential = parseCodexManagedCredentialManifest(
            await readCredentialManifest(entryPath),
          );
          const { loginId, version } = parsedEntry;
          const homeReference = agentCodexManagedHomeReference(
            providerId,
            version,
            loginId,
          );

          if (credential.providerId !== providerId ||
              credential.version !== version ||
              credential.homeReference !== homeReference) {
            throw new Error("Codex managed credential identity is invalid.");
          }
          manifests.push({
            file: entryPath,
            home: { loginId, providerId, version },
            reference: {
              digest: agentCredentialDigest(credential),
              reference: agentCredentialEntryReference(
                providerId,
                entry.name,
              ),
              version,
            },
          });
          continue;
        }
        if (entry.isDirectory() && parsedEntry?.kind === "managed-home") {
          const identity = {
            loginId: parsedEntry.loginId,
            providerId,
            version: parsedEntry.version,
          } as const;

          await this.#managedHomes.assertDirectory(identity);
          homes.set(
            agentCodexManagedHomeReference(
              providerId,
              parsedEntry.version,
              parsedEntry.loginId,
            ),
            identity,
          );
          continue;
        }
        throw new Error("Agent credential provider partition is invalid.");
      }
    }
    const discovered = new Map(manifests.map(({ reference }) =>
      [reference.reference, reference] as const
    ));

    for (const [referencePath, reference] of referenced) {
      const actual = discovered.get(referencePath);

      if (!actual || actual.digest !== reference.digest ||
          actual.version !== reference.version) {
        throw new Error("Agent credential authority does not match its manifest.");
      }
    }
    for (const home of homes.values()) await this.#managedHomes.seal(home);
    const referencedHomes = new Set([...referenced.values()].flatMap(
      (reference) => {
        const identity = parseAgentCredentialReference(reference);

        return identity.kind === "chatgpt-device-code"
          ? [agentCodexManagedHomeReference(
              identity.providerId,
              identity.version,
              identity.loginId,
            )]
          : [];
      },
    ));

    for (const manifest of manifests) {
      if (referenced.has(manifest.reference.reference)) continue;
      if (manifest.home) await this.#managedHomes.remove(manifest.home);
      await unlink(manifest.file);
      await fsyncDirectory(path.dirname(manifest.file));
    }
    for (const [homeReference, home] of homes) {
      if (!referencedHomes.has(homeReference)) {
        await this.#managedHomes.remove(home);
      }
    }
    for (const providerDirectory of providerDirectories) {
      if ((await readdir(providerDirectory)).length === 0) {
        await rmdir(providerDirectory);
        await fsyncDirectory(providersDirectory);
      }
    }
  }

  async #read(reference: AgentCredentialReference) {
    const { kind, providerId, version } =
      parseAgentCredentialReference(reference);

    if (kind !== "api-key") throw new Error("Agent credential is not an API key.");
    const file = path.join(this.#root, reference.reference);

    await assertSecureStateDirectory(this.#root);
    await assertSecureStateDirectory(path.join(this.#root, "providers"));
    await assertSecureStateDirectory(path.join(this.#root, "providers", providerId));
    const credential = parseApiKeyCredentialManifest(
      await readCredentialManifest(file),
    );

    if (credential.providerId !== providerId || credential.version !== version ||
        agentCredentialDigest(credential) !== reference.digest) {
      throw new Error("Agent credential reference verification failed.");
    }
    return credential;
  }

  async #ensureProviderPartition(providerId: string) {
    if (!isAgentCredentialProviderId(providerId)) {
      throw new Error("Agent credential provider id is invalid.");
    }
    const providersDirectory = path.join(this.#root, "providers");
    const providerDirectory = path.join(providersDirectory, providerId);

    await ensureSecureStateDirectory(this.#root);
    await ensureSecureStateDirectory(providersDirectory);
    await ensureSecureStateDirectory(providerDirectory);
    return providerDirectory;
  }
}
