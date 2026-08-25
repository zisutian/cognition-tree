// SPDX-License-Identifier: GPL-3.0-or-later

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
  BootstrapConfigurationStore,
} from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import {
  SystemConfigurationConflictError,
  SystemConfigurationValidationError,
} from "../../../../application/system/systemConfiguration.ts";

const projectRoots: string[] = [];

async function createStore() {
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
    store: new BootstrapConfigurationStore(projectRoot),
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

  it("requires a credential before LAN mode and never persists its secret", async () => {
    const { file, store } = await createStore();
    const initial = await store.readSnapshot();

    await expect(store.update(initial.revision, {
      listenMode: "lan",
      maxAuditEntries: 1_000,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
      repositoryHostRoot: null,
    })).rejects.toBeInstanceOf(SystemConfigurationValidationError);
    const rotated = await store.rotateOwnerCredential(initial.revision);

    expect(rotated.secret).toMatch(/^ctn_owner_[A-Za-z0-9_-]{43}$/);
    expect(rotated.configuration.ownerCredentialConfigured).toBe(true);
    expect(await store.authenticateOwnerSecret(rotated.secret)).toBe(true);
    expect(await store.authenticateOwnerSecret(`${rotated.secret}x`)).toBe(false);
    expect(await readFile(file, "utf8")).not.toContain(rotated.secret);
    const configured = await store.update(rotated.configuration.revision, {
      listenMode: "lan",
      maxAuditEntries: 1_000,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
      repositoryHostRoot: null,
    });

    await expect(store.clearOwnerCredential(configured.revision))
      .rejects.toBeInstanceOf(SystemConfigurationValidationError);
  });

  it("signs twelve-hour sessions and invalidates them on credential rotation", async () => {
    const { store } = await createStore();
    const initial = await store.readSnapshot();
    const rotated = await store.rotateOwnerCredential(initial.revision);
    const issuedAt = new Date("2026-08-25T00:00:00.000Z");
    const session = await store.createOwnerSession(issuedAt);

    expect(await store.verifyOwnerSession(
      session,
      new Date("2026-08-25T11:59:59.999Z"),
    )).toBe(true);
    expect(await store.verifyOwnerSession(
      session,
      new Date("2026-08-25T12:00:00.000Z"),
    )).toBe(false);
    expect(await store.verifyOwnerSession(`${session}x`, issuedAt)).toBe(false);
    await store.rotateOwnerCredential(rotated.configuration.revision);
    expect(await store.verifyOwnerSession(session, issuedAt)).toBe(false);
  });

  it("fails closed when persisted bootstrap state is damaged", async () => {
    const { file, projectRoot, store } = await createStore();

    await store.readSnapshot();
    await writeFile(file, '{"formatVersion":999}\n', { mode: 0o600 });
    const reloaded = new BootstrapConfigurationStore(projectRoot);

    await expect(reloaded.readSnapshot()).rejects.toThrow(
      "bootstrap configuration has unsupported or missing fields",
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
});
