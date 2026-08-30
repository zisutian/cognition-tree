// SPDX-License-Identifier: GPL-3.0-or-later

import { createHmac, randomBytes } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SystemConfigurationConflictError,
  SystemConfigurationValidationError,
} from "../../../../application/system/systemConfiguration.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { replaceFileDurably } from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import {
  SecureStateCommitOutcomeUnknownError,
  type SecureStateFileReplacer,
} from "../../../../infrastructure/server/state/secureJsonPartition.ts";
import {
  BootstrapConfigurationStore,
  type BootstrapConfigurationStoreOptions,
} from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import {
  digestOwnerCredentialSecret,
  type OwnerCredentialState,
} from "../../../../infrastructure/server/system/ownerCredential.ts";
import { createStateDigest } from "../../../../infrastructure/server/state/stateDigest.ts";

const projectRoots: string[] = [];
const ownerSecret = (character: string) =>
  `ctn_owner_${character.repeat(43)}`;

async function readPersistedOwnerCredential(file: string) {
  const state = JSON.parse(await readFile(file, "utf8")) as {
    ownerCredential: OwnerCredentialState;
  };

  return state.ownerCredential;
}

async function createStore(options: BootstrapConfigurationStoreOptions = {}) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-bootstrap-"));

  projectRoots.push(projectRoot);
  return {
    file: path.join(
      projectRoot,
      ".cognition-tree",
      "bootstrap-v1",
      "configuration.json",
    ),
    projectRoot,
    store: new BootstrapConfigurationStore(projectRoot, options),
  };
}

async function ownerSecretAuthenticates(
  store: BootstrapConfigurationStore,
  secret: string,
) {
  return await store.createOwnerSessionForSecret(secret) !== null;
}

function controlledReplacement() {
  let failure: "after" | "before" | null = null;
  const replaceConfigurationFile: SecureStateFileReplacer = async (
    filePath,
    content,
    options,
  ) => {
    if (failure === "before") {
      failure = null;
      throw new Error("simulated failure before replacement");
    }
    await replaceFileDurably(filePath, content, options);
    if (failure === "after") {
      failure = null;
      throw new Error("simulated failure after replacement");
    }
  };

  return {
    failAfterReplacement: () => { failure = "after"; },
    failBeforeReplacement: () => { failure = "before"; },
    replaceConfigurationFile,
  };
}

afterEach(async () => {
  await Promise.all(projectRoots.splice(0).map((projectRoot) =>
    rm(projectRoot, { force: true, recursive: true })
  ));
});

describe("Bootstrap configuration store", () => {
  it("creates the explicit initial configuration in a protected control partition", async () => {
    const { file, projectRoot, store } = await createStore();
    const snapshot = await store.readSnapshot();

    expect(snapshot).toEqual({
      configuration: {
        dataRoot: path.join(projectRoot, ".cognition-tree"),
        listenMode: "loopback",
        maxAuditEntries: 1_000,
        port: 3_001,
        publicOrigin: null,
        repositoryHostRoot: null,
      },
      ownerCredentialConfigured: false,
      ownerCredentialRotationPending: false,
      revision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      version: 1,
    });
    expect((await lstat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect((await lstat(file)).mode & 0o777).toBe(0o600);
  });

  it("uses exact CAS and keeps the fixed data root out of ordinary updates", async () => {
    const { projectRoot, store } = await createStore();
    const initial = await store.readSnapshot();
    const updated = await store.update(initial.revision, {
      listenMode: "loopback",
      maxAuditEntries: 25,
      port: 4_321,
      publicOrigin: null,
      repositoryHostRoot: path.join(projectRoot, "host-repositories"),
    });

    expect(updated).toMatchObject({
      configuration: {
        dataRoot: initial.configuration.dataRoot,
        maxAuditEntries: 25,
        port: 4_321,
      },
      version: 2,
    });
    await expect(store.update(initial.revision, {
      listenMode: "loopback",
      maxAuditEntries: 30,
      port: 4_322,
      publicOrigin: null,
      repositoryHostRoot: null,
    })).rejects.toBeInstanceOf(SystemConfigurationConflictError);
  });

  it("requires an activated credential for LAN and never authenticates pending", async () => {
    const secret = ownerSecret("a");
    const { file, store } = await createStore({
      createOwnerCredentialRotationId: () => "rotation-1",
      createOwnerCredentialSecret: () => secret,
    });
    const initial = await store.readSnapshot();
    const preparation = await store.prepareOwnerCredentialRotation(
      initial.revision,
    );

    expect(preparation).toMatchObject({
      configuration: {
        ownerCredentialConfigured: false,
        ownerCredentialRotationPending: true,
      },
      rotationId: "rotation-1",
      secret,
    });
    await expect(store.prepareOwnerCredentialRotation(initial.revision))
      .rejects.toBeInstanceOf(SystemConfigurationConflictError);
    expect(await ownerSecretAuthenticates(store, secret)).toBe(false);
    await expect(store.update(preparation.configuration.revision, {
      listenMode: "lan",
      maxAuditEntries: 1_000,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
      repositoryHostRoot: null,
    })).rejects.toBeInstanceOf(SystemConfigurationValidationError);
    const activated = await store.activateOwnerCredentialRotation(
      preparation.configuration.revision,
      preparation.rotationId,
      preparation.secret,
    );

    expect(activated.configuration).toMatchObject({
      ownerCredentialConfigured: true,
      ownerCredentialRotationPending: false,
    });
    expect(await ownerSecretAuthenticates(store, secret)).toBe(true);
    expect(await readFile(file, "utf8")).not.toContain(secret);
    const configured = await store.update(activated.configuration.revision, {
      listenMode: "lan",
      maxAuditEntries: 1_000,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
      repositoryHostRoot: null,
    });

    await expect(store.clearOwnerCredential(configured.revision))
      .rejects.toBeInstanceOf(SystemConfigurationValidationError);
  });

  it("keeps the active secret and session valid until activation succeeds", async () => {
    const secrets = [ownerSecret("b"), ownerSecret("c")];
    const rotationIds = ["rotation-1", "rotation-2"];
    const { file, store } = await createStore({
      createOwnerCredentialRotationId: () => rotationIds.shift()!,
      createOwnerCredentialSecret: () => secrets.shift()!,
    });
    const initial = await store.readSnapshot();
    const first = await store.prepareOwnerCredentialRotation(initial.revision);
    const firstActivated = await store.activateOwnerCredentialRotation(
      first.configuration.revision,
      first.rotationId,
      first.secret,
    );
    const issuedAt = new Date("2026-08-25T00:00:00.000Z");
    const session = await store.createOwnerSessionForSecret(
      first.secret,
      issuedAt,
    );
    if (!session) throw new Error("expected the active secret to issue a session");
    const second = await store.prepareOwnerCredentialRotation(
      firstActivated.configuration.revision,
    );

    expect((await readPersistedOwnerCredential(file)).activeVersion).toBe(2);
    expect(await ownerSecretAuthenticates(store, first.secret)).toBe(true);
    expect(await ownerSecretAuthenticates(store, second.secret)).toBe(false);
    expect(await store.verifyOwnerSession(firstActivated.ownerSession)).toBe(true);
    expect(await store.verifyOwnerSession(session, issuedAt)).toBe(true);
    await expect(store.activateOwnerCredentialRotation(
      firstActivated.configuration.revision,
      second.rotationId,
      second.secret,
    )).rejects.toBeInstanceOf(SystemConfigurationConflictError);
    await expect(store.activateOwnerCredentialRotation(
      second.configuration.revision,
      "wrong-rotation",
      second.secret,
    )).rejects.toBeInstanceOf(SystemConfigurationValidationError);
    await expect(store.activateOwnerCredentialRotation(
      second.configuration.revision,
      second.rotationId,
      first.secret,
    )).rejects.toBeInstanceOf(SystemConfigurationValidationError);
    expect((await readPersistedOwnerCredential(file)).activeVersion).toBe(2);
    expect(await store.verifyOwnerSession(session, issuedAt)).toBe(true);
    expect(await store.verifyOwnerSession(
      session,
      new Date("2026-08-25T12:00:00.000Z"),
    )).toBe(false);
    await store.activateOwnerCredentialRotation(
      second.configuration.revision,
      second.rotationId,
      second.secret,
    );
    expect((await readPersistedOwnerCredential(file)).activeVersion).toBe(3);
    expect(await ownerSecretAuthenticates(store, first.secret)).toBe(false);
    expect(await ownerSecretAuthenticates(store, second.secret)).toBe(true);
    expect(await store.verifyOwnerSession(firstActivated.ownerSession)).toBe(false);
    expect(await store.verifyOwnerSession(session, issuedAt)).toBe(false);
  });

  it("keeps the old credential active when prepare replacement becomes unknown", async () => {
    const replacement = controlledReplacement();
    const secrets = [ownerSecret("d"), ownerSecret("e")];
    const rotationIds = ["rotation-1", "rotation-2"];
    const { projectRoot, store } = await createStore({
      createOwnerCredentialRotationId: () => rotationIds.shift()!,
      createOwnerCredentialSecret: () => secrets.shift()!,
      replaceConfigurationFile: replacement.replaceConfigurationFile,
    });
    const initial = await store.readSnapshot();
    const first = await store.prepareOwnerCredentialRotation(initial.revision);
    const activated = await store.activateOwnerCredentialRotation(
      first.configuration.revision,
      first.rotationId,
      first.secret,
    );

    replacement.failAfterReplacement();
    await expect(store.prepareOwnerCredentialRotation(
      activated.configuration.revision,
    ))
      .rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    const reloaded = new BootstrapConfigurationStore(projectRoot, {
      createOwnerCredentialRotationId: () => "rotation-3",
      createOwnerCredentialSecret: () => ownerSecret("f"),
    });
    const reloadedSnapshot = await reloaded.readSnapshot();

    expect(await ownerSecretAuthenticates(reloaded, first.secret)).toBe(true);
    expect(await ownerSecretAuthenticates(reloaded, ownerSecret("e"))).toBe(false);
    const replacementPreparation = await reloaded.prepareOwnerCredentialRotation(
      reloadedSnapshot.revision,
    );
    const persisted = JSON.parse(await readFile(
      path.join(
        projectRoot,
        ".cognition-tree",
        "bootstrap-v1",
        "configuration.json",
      ),
      "utf8",
    )) as Record<string, unknown>;

    expect(replacementPreparation.rotationId).toBe("rotation-3");
    expect(JSON.stringify(persisted)).not.toContain("rotation-2");
  });

  it("retries activation after a verified pre-replacement failure", async () => {
    const replacement = controlledReplacement();
    const secrets = [ownerSecret("g"), ownerSecret("h")];
    const rotationIds = ["rotation-1", "rotation-2"];
    const { store } = await createStore({
      createOwnerCredentialRotationId: () => rotationIds.shift()!,
      createOwnerCredentialSecret: () => secrets.shift()!,
      replaceConfigurationFile: replacement.replaceConfigurationFile,
    });
    const initial = await store.readSnapshot();
    const first = await store.prepareOwnerCredentialRotation(initial.revision);
    const activated = await store.activateOwnerCredentialRotation(
      first.configuration.revision,
      first.rotationId,
      first.secret,
    );
    const second = await store.prepareOwnerCredentialRotation(
      activated.configuration.revision,
    );

    replacement.failBeforeReplacement();
    await expect(store.activateOwnerCredentialRotation(
      second.configuration.revision,
      second.rotationId,
      second.secret,
    )).rejects.toThrow("simulated failure before replacement");
    expect(await ownerSecretAuthenticates(store, first.secret)).toBe(true);
    expect(await ownerSecretAuthenticates(store, second.secret)).toBe(false);
    await store.activateOwnerCredentialRotation(
      second.configuration.revision,
      second.rotationId,
      second.secret,
    );
    expect(await ownerSecretAuthenticates(store, second.secret)).toBe(true);
  });

  it("leaves a recoverable secret in hand when activation becomes unknown", async () => {
    const replacement = controlledReplacement();
    const secrets = [ownerSecret("i"), ownerSecret("j")];
    const rotationIds = ["rotation-1", "rotation-2"];
    const { projectRoot, store } = await createStore({
      createOwnerCredentialRotationId: () => rotationIds.shift()!,
      createOwnerCredentialSecret: () => secrets.shift()!,
      replaceConfigurationFile: replacement.replaceConfigurationFile,
    });
    const initial = await store.readSnapshot();
    const first = await store.prepareOwnerCredentialRotation(initial.revision);
    const activated = await store.activateOwnerCredentialRotation(
      first.configuration.revision,
      first.rotationId,
      first.secret,
    );
    const second = await store.prepareOwnerCredentialRotation(
      activated.configuration.revision,
    );

    replacement.failAfterReplacement();
    await expect(store.activateOwnerCredentialRotation(
      second.configuration.revision,
      second.rotationId,
      second.secret,
    )).rejects.toBeInstanceOf(SecureStateCommitOutcomeUnknownError);
    const reloaded = new BootstrapConfigurationStore(projectRoot);

    expect(await ownerSecretAuthenticates(reloaded, first.secret)).toBe(false);
    expect(await ownerSecretAuthenticates(reloaded, second.secret)).toBe(true);
  });

  it("clears active and pending credential state together", async () => {
    const rotationIds = ["rotation-1", "rotation-2"];
    const secrets = [ownerSecret("k"), ownerSecret("m")];
    const { store } = await createStore({
      createOwnerCredentialRotationId: () => rotationIds.shift()!,
      createOwnerCredentialSecret: () => secrets.shift()!,
    });
    const initial = await store.readSnapshot();
    const first = await store.prepareOwnerCredentialRotation(
      initial.revision,
    );
    const activated = await store.activateOwnerCredentialRotation(
      first.configuration.revision,
      first.rotationId,
      first.secret,
    );
    const pending = await store.prepareOwnerCredentialRotation(
      activated.configuration.revision,
    );
    const cleared = await store.clearOwnerCredential(
      pending.configuration.revision,
    );

    expect(cleared).toMatchObject({
      ownerCredentialConfigured: false,
      ownerCredentialRotationPending: false,
    });
    expect(await ownerSecretAuthenticates(store, first.secret)).toBe(false);
    expect(await ownerSecretAuthenticates(store, pending.secret)).toBe(false);
  });

  it("materializes v1 credentials into the v2 aggregate without changing auth", async () => {
    const { file, projectRoot, store } = await createStore();

    await store.readSnapshot();
    const secret = ownerSecret("l");
    const sessionSigningKey = randomBytes(32).toString("base64url");
    const legacyContent = {
      configuration: {
        dataRoot: path.join(projectRoot, ".cognition-tree"),
        listenMode: "loopback",
        maxAuditEntries: 1_000,
        port: 3_001,
        publicOrigin: null,
        repositoryHostRoot: null,
      },
      formatVersion: 1,
      ownerCredentialDigest: digestOwnerCredentialSecret(secret),
      ownerCredentialVersion: 7,
      sessionSigningKey,
      version: 11,
    } as const;
    const legacy = {
      ...legacyContent,
      digest: `sha256:${createStateDigest(serializeJsonIteratively(
        legacyContent,
        { sortObjectKeys: true },
      ))}`,
    };

    await writeFile(file, `${serializeJsonIteratively(legacy, {
      indent: 2,
      sortObjectKeys: true,
    })}\n`, { mode: 0o600 });
    const reloaded = new BootstrapConfigurationStore(projectRoot);
    const snapshot = await reloaded.readSnapshot();
    const now = new Date("2026-08-25T00:00:00.000Z");
    const payload = Buffer.from(JSON.stringify({
      credentialVersion: 7,
      expiresAt: now.getTime() + 60_000,
    }), "utf8").toString("base64url");
    const session = `${payload}.${createHmac(
      "sha256",
      Buffer.from(sessionSigningKey, "base64url"),
    ).update(payload, "utf8").digest("base64url")}`;
    const persisted = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;

    expect(snapshot).toMatchObject({
      ownerCredentialConfigured: true,
      ownerCredentialRotationPending: false,
      version: 11,
    });
    expect(await ownerSecretAuthenticates(reloaded, secret)).toBe(true);
    expect(await reloaded.verifyOwnerSession(session, now)).toBe(true);
    expect(persisted).toMatchObject({
      formatVersion: 2,
      ownerCredential: {
        activeDigest: legacyContent.ownerCredentialDigest,
        activeVersion: 7,
        pendingRotation: null,
      },
      version: 11,
    });
    expect(persisted).not.toHaveProperty("ownerCredentialDigest");
    expect(persisted).not.toHaveProperty("ownerCredentialVersion");
  });

  it("fails closed when persisted bootstrap state is damaged", async () => {
    const { file, projectRoot, store } = await createStore();

    await store.readSnapshot();
    await writeFile(file, '{"formatVersion":999}\n', { mode: 0o600 });
    const reloaded = new BootstrapConfigurationStore(projectRoot);

    await expect(reloaded.readSnapshot()).rejects.toThrow(
      "bootstrap configuration format is invalid",
    );
  });

  it("recovery explicitly replaces only the bootstrap pointer", async () => {
    const { file, projectRoot, store } = await createStore();
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-recovery-data-"));

    projectRoots.push(externalRoot);
    await store.readSnapshot();
    await writeFile(file, "{broken", { mode: 0o600 });
    await store.recover(externalRoot);
    const recovered = new BootstrapConfigurationStore(projectRoot);

    expect((await recovered.readSnapshot()).configuration).toMatchObject({
      dataRoot: externalRoot,
      listenMode: "loopback",
      port: 3_001,
    });
  });

  it("classifies invalid data-root choices as configuration validation", async () => {
    const { projectRoot, store } = await createStore();
    const snapshot = await store.readSnapshot();

    await expect(store.setDataRoot(snapshot.revision, "relative-root"))
      .rejects.toBeInstanceOf(SystemConfigurationValidationError);
    await expect(store.recover("relative-root"))
      .rejects.toBeInstanceOf(SystemConfigurationValidationError);
    await expect(store.recover(path.join(projectRoot, "missing-root")))
      .rejects.toBeInstanceOf(SystemConfigurationValidationError);
  });
});
