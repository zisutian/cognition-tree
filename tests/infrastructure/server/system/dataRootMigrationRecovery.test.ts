// SPDX-License-Identifier: GPL-3.0-or-later

import { localRepositoryWriterLockName } from "../../../../infrastructure/server/repository/repositoryRuntimeLayout.ts";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationWriteBarrier } from "../../../../application/runtime/writeBarrier.ts";
import { DataRootMigrationCoordinator } from "../../../../application/system/dataRootMigrationCoordinator.ts";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { createDataRootMigrationFileOperations } from "../../../../infrastructure/server/system/dataRootMigrationFiles.ts";
import { FileDataRootMigrationRecordStore } from "../../../../infrastructure/server/system/dataRootMigrationRecordStore.ts";
import { replaceFileDurably } from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";

const dataRootMigrationFileOperations = createDataRootMigrationFileOperations(localRepositoryWriterLockName);













const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-recovery-"));
  roots.push(root);
  const controlRoot = path.join(root, ".cognition-tree", "bootstrap-v1");
  const destination = path.join(root, "destination");
  const faults = { pointerAfterReplace: false, recordAfterReplace: false };
  const bootstrap = new BootstrapConfigurationStore(root, { replaceConfigurationFile: async (file, source, options) => {
    await replaceFileDurably(file, source, options);
    if (faults.pointerAfterReplace && source.includes(destination)) throw new Error("pointer acknowledgment lost");
  } });
  const records = new FileDataRootMigrationRecordStore(controlRoot, async (file, source, options) => {
    await replaceFileDurably(file, source, options);
    if (faults.recordAfterReplace && source.includes('"restarting"')) throw new Error("record acknowledgment lost");
  });
  const initial = await bootstrap.readSnapshot();
  const source = initial.configuration.dataRoot;
  await mkdir(path.join(source, "repositories"), { mode: 0o700 });
  await writeFile(path.join(source, "repositories", "content"), "preserved", { mode: 0o600 });
  const barrier = new ApplicationWriteBarrier();
  const restart = vi.fn(async () => undefined);
  const dependencies = { bootstrap, controlRoot, createId: randomUUID, files: dataRootMigrationFileOperations, hasActiveAgentWork: () => false, maintenance: barrier, records, requestRestart: restart };
  const coordinator = new DataRootMigrationCoordinator(dependencies);
  async function start() { await coordinator.start(initial.revision, destination); }
  async function wait(status: string) {
    await vi.waitFor(async () => expect((await coordinator.current())?.status).toBe(status));
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { root, initial, source, destination, coordinator, barrier, restart, bootstrap, records, faults, dependencies, start, wait };
}

describe("durable migration reconciliation", () => {
  it("proves a replaced bootstrap pointer without repeating the commit", async () => {
    const f = await fixture();
    f.faults.pointerAfterReplace = true;
    const commit = vi.spyOn(f.bootstrap, "commitDataRootChange");
    await f.start();
    await f.wait("restarting");
    expect(commit).toHaveBeenCalledOnce();
    expect((await f.bootstrap.readSnapshot()).configuration.dataRoot).toBe(f.destination);
    expect(f.barrier.isClosed()).toBe(true);
    expect(f.restart).toHaveBeenCalledOnce();
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "completed", commitOutcome: "committed" });
    expect(f.barrier.isClosed()).toBe(false);
  });

  it("keeps both directories and permits another reconciliation after a transient failure", async () => {
    const f = await fixture();
    f.faults.pointerAfterReplace = true;
    vi.spyOn(f.bootstrap, "reconcileDataRootChange").mockRejectedValueOnce(new Error("temporary disk failure"));
    await f.start();
    await f.wait("recovery-required");
    expect(f.barrier.isClosed()).toBe(true);
    expect(() => f.barrier.enter()).toThrow();
    expect(f.restart).toHaveBeenCalledOnce();
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "completed" });
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "completed" });
    for (const directory of [f.source, f.destination]) expect(await readFile(path.join(directory, "repositories", "content"), "utf8")).toBe("preserved");
  });

  it("recovers the durable migration record after its acknowledgment was lost", async () => {
    const f = await fixture();
    f.faults.recordAfterReplace = true;
    await f.start();
    await f.wait("recovery-required");
    expect(f.barrier.isClosed()).toBe(true);
    f.faults.recordAfterReplace = false;
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "completed", commitOutcome: "committed" });
    expect(f.barrier.isClosed()).toBe(false);
  });

  it("does not open writes when the committed target fails verification", async () => {
    const f = await fixture();
    await f.start();
    await f.wait("restarting");
    await writeFile(path.join(f.destination, "repositories", "content"), "changed outside service", { mode: 0o600 });
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "recovery-required", commitOutcome: "unknown" });
    expect(f.barrier.isClosed()).toBe(true);
    expect(await f.coordinator.recoverOnStartup()).toMatchObject({ status: "recovery-required" });
    expect(await readFile(path.join(f.source, "repositories", "content"), "utf8")).toBe("preserved");
  });

  it("retains a committed migration when automatic restart fails", async () => {
    const f = await fixture();
    f.restart.mockRejectedValueOnce(new Error("restart unavailable"));
    await f.start();
    await f.wait("restarting");
    expect(await f.coordinator.current()).toMatchObject({ commitOutcome: "committed", errorMessage: expect.stringContaining("restart unavailable") });
    expect(f.barrier.isClosed()).toBe(true);
    const current = (await f.coordinator.current())!;
    await f.coordinator.reconcile(current.id);
    await vi.waitFor(() => expect(f.restart).toHaveBeenCalledTimes(2));
  });

  it("drains admitted writes and rejects a session that entered during preflight", async () => {
    const f = await fixture();
    const writer = f.barrier.enter();
    let sessions = false;
    f.dependencies.hasActiveAgentWork = () => sessions;
    await f.start();
    expect(f.barrier.isClosed()).toBe(true);
    sessions = true;
    writer.finish();
    await f.wait("failed");
    expect((await f.bootstrap.readSnapshot()).configuration.dataRoot).toBe(f.source);
    expect(f.barrier.isClosed()).toBe(false);
    expect(f.restart).not.toHaveBeenCalled();
  });
});
