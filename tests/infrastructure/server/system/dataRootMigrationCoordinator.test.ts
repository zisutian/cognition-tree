// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { FileDataRootMigrationRecordStore } from "../../../../infrastructure/server/system/dataRootMigrationRecordStore.ts";
import type { DataRootMigrationFiles } from "../../../../application/system/dataRootMigrationPorts.ts";
import { localRepositoryWriterLockName } from "../../../../infrastructure/server/repository/repositoryRuntimeLayout.ts";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemMigrationConflictError, SystemMigrationNotFoundError, SystemMigrationValidationError } from "../../../../application/system/systemConfigurationModel.ts";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { DataRootMigrationCoordinator } from "../../../../application/system/dataRootMigrationCoordinator.ts";
import {
  createDataRootMigrationFileOperations,
} from "../../../../infrastructure/server/system/dataRootMigrationFiles.ts";

const dataRootMigrationFileOperations = createDataRootMigrationFileOperations(localRepositoryWriterLockName);










const roots: string[] = [];

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function fixture(
  hasResidentSessions = false,
  hasPendingCodexLogin = false,
  fileOperations: DataRootMigrationFiles =
    dataRootMigrationFileOperations,
) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-project-"));
  const targetParent = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-target-"));
  const bootstrap = new BootstrapConfigurationStore(projectRoot);
  const initial = await bootstrap.readSnapshot();
  const source = initial.configuration.dataRoot;
  const finish = vi.fn();
  const beginMaintenance = vi.fn(async () => ({ finish }));
  const requestRestart = vi.fn(async () => undefined);

  roots.push(projectRoot, targetParent);
  for (const relative of [
    "repositories/primary/note.ctn",
    "server/access-v1/automation-tokens.json",
    "server/agent-auth-v1/providers/provider-1/api-key-v1.json",
    "server/agent-config-v1/configuration.json",
    "server/operations-v1/operations.json",
    "server/agent-v2/operations.json",
    "server/api-v1/legacy.json",
    "server/agent-v1/legacy.json",
  ]) {
    const file = path.join(source, relative);

    await mkdir(path.dirname(file), { mode: 0o700, recursive: true });
    await writeFile(file, relative, { mode: 0o600 });
  }
  const coordinator = new DataRootMigrationCoordinator({
    hasActiveAgentWork: () => hasPendingCodexLogin || hasResidentSessions,
    createId: randomUUID,
    records: new FileDataRootMigrationRecordStore(path.join(projectRoot, ".cognition-tree", "bootstrap-v1")),
    bootstrap,
    controlRoot: path.join(projectRoot, ".cognition-tree", "bootstrap-v1"),
    files: fileOperations,
    maintenance: { begin: beginMaintenance },
    requestRestart,
  });

  return {
    beginMaintenance,
    bootstrap,
    coordinator,
    finish,
    initial,
    requestRestart,
    source,
    target: path.join(targetParent, "migrated"),
  };
}

async function waitForTerminal(
  coordinator: DataRootMigrationCoordinator,
  id: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await coordinator.get(id);

    if (status.status === "failed") return status;
    if (status.status === "restarting") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return coordinator.get(id);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("migration did not finish");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })
  ));
});

describe("data-root migration coordinator", () => {
  it("copies and verifies only authoritative partitions before switching the pointer", async () => {
    const fixtureValue = await fixture();
    const sourceNote = path.join(
      fixtureValue.source,
      "repositories/primary/note.ctn",
    );
    const preservedTime = new Date("2026-08-01T01:02:03.000Z");

    await utimes(sourceNote, preservedTime, preservedTime);
    const started = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      path.join(path.dirname(fixtureValue.target), "nested", "migrated"),
    );
    const terminal = await waitForTerminal(fixtureValue.coordinator, started.id);
    const target = terminal.destination;

    expect(terminal.status).toBe("restarting");
    expect(fixtureValue.requestRestart).toHaveBeenCalledOnce();
    expect((await fixtureValue.bootstrap.readSnapshot()).configuration.dataRoot)
      .toBe(target);
    expect((await stat(sourceNote)).mtime.toISOString()).toBe(
      preservedTime.toISOString(),
    );
    expect((await stat(path.join(target, "repositories/primary/note.ctn"))).mtime
      .toISOString()).toBe(preservedTime.toISOString());
    expect(await readFile(
      path.join(target, "repositories/primary/note.ctn"),
      "utf8",
    )).toBe("repositories/primary/note.ctn");
    expect(await readFile(
      path.join(
        target,
        "server/agent-auth-v1/providers/provider-1/api-key-v1.json",
      ),
      "utf8",
    )).toBe("server/agent-auth-v1/providers/provider-1/api-key-v1.json");
    expect(await readFile(
      path.join(target, "server/operations-v1/operations.json"),
      "utf8",
    )).toBe("server/operations-v1/operations.json");
    await expect(access(path.join(target, "server/agent-v2/operations.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(target, "server/api-v1/legacy.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(target, "server/agent-v1/legacy.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(fixtureValue.source)).isDirectory()).toBe(true);
    expect(fixtureValue.finish).not.toHaveBeenCalled();
  });

  it("rejects resident Agent sessions and overlapping destinations before maintenance", async () => {
    const resident = await fixture(true);

    await expect(resident.coordinator.start(
      resident.initial.revision,
      resident.target,
    )).rejects.toBeInstanceOf(SystemMigrationConflictError);
    const pendingLogin = await fixture(false, true);

    await expect(pendingLogin.coordinator.start(
      pendingLogin.initial.revision,
      pendingLogin.target,
    )).rejects.toBeInstanceOf(SystemMigrationConflictError);
    const available = await fixture();

    await expect(available.coordinator.start(
      available.initial.revision,
      path.join(available.source, "nested"),
    )).rejects.toBeInstanceOf(SystemMigrationValidationError);
  });

  it("reserves the coordinator before asynchronous migration preparation", async () => {
    const preparation = deferred<string>();
    const fixtureValue = await fixture(false, false, {
      ...dataRootMigrationFileOperations,
      prepareDestination: vi.fn(() => preparation.promise),
    });
    const first = fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    );

    await Promise.resolve();
    await expect(fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      `${fixtureValue.target}-second`,
    )).rejects.toBeInstanceOf(SystemMigrationConflictError);

    preparation.resolve(fixtureValue.target);
    const started = await first;

    expect(started.destination).toBe(fixtureValue.target);
    await waitForTerminal(fixtureValue.coordinator, started.id);
  });

  it("enters maintenance before the accepted start is observed", async () => {
    const fixtureValue = await fixture();
    const started = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    );

    expect(fixtureValue.beginMaintenance).toHaveBeenCalledOnce();
    await waitForTerminal(fixtureValue.coordinator, started.id);
  });

  it("releases a starting reservation after preflight failure", async () => {
    const prepareDestination = vi.fn(async () => "");
    const fixtureValue = await fixture(false, false, {
      ...dataRootMigrationFileOperations,
      copy: vi.fn(async () => {
        throw new Error("stop after reservation assertion");
      }),
      prepareDestination,
      verify: vi.fn(async () => "unused"),
    });

    prepareDestination
      .mockRejectedValueOnce(new Error("preflight failed"))
      .mockResolvedValueOnce(fixtureValue.target);

    await expect(fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    )).rejects.toThrow("preflight failed");
    const started = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    );

    expect(prepareDestination).toHaveBeenCalledTimes(2);
    await waitForTerminal(fixtureValue.coordinator, started.id);
  });

  it("retains only the currently observable migration", async () => {
    const fixtureValue = await fixture(false, false, {
      ...dataRootMigrationFileOperations,
      copy: vi.fn(async () => {
        throw new Error("injected copy failure");
      }),
      prepareDestination: vi.fn(async (destination) => destination),
      verify: vi.fn(async () => "unused"),
    });
    const first = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    );

    await waitForTerminal(fixtureValue.coordinator, first.id);
    const second = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      `${fixtureValue.target}-second`,
    );

    await expect(fixtureValue.coordinator.get(first.id)).rejects
      .toBeInstanceOf(SystemMigrationNotFoundError);
    await expect(fixtureValue.coordinator.get(second.id)).resolves
      .toMatchObject({ id: second.id });
    await waitForTerminal(fixtureValue.coordinator, second.id);
  });

  it("retains a failed copy without changing the bootstrap pointer", async () => {
    const fixtureValue = await fixture();

    await symlink(
      "note.ctn",
      path.join(fixtureValue.source, "repositories/primary/link.ctn"),
    );
    const started = await fixtureValue.coordinator.start(
      fixtureValue.initial.revision,
      fixtureValue.target,
    );
    const terminal = await waitForTerminal(fixtureValue.coordinator, started.id);

    expect(terminal).toMatchObject({
      errorMessage: expect.stringContaining("Symbolic link is not allowed"),
      status: "failed",
    });
    expect((await fixtureValue.bootstrap.readSnapshot()).configuration.dataRoot)
      .toBe(fixtureValue.source);
    await expect(access(fixtureValue.target)).resolves.toBeUndefined();
    expect(fixtureValue.finish).toHaveBeenCalledOnce();
    expect(fixtureValue.requestRestart).not.toHaveBeenCalled();
  });

  it("preserves a foreign destination created after preflight", async () => {
    const fixtureValue = await fixture(false, false, {
      ...dataRootMigrationFileOperations,
      async copy(source, destination, allocated) {
        await mkdir(destination);
        await writeFile(path.join(destination, "foreign.txt"), "owned by another operation");
        await dataRootMigrationFileOperations.copy(source, destination, allocated);
      },
    });
    const started = await fixtureValue.coordinator.start(fixtureValue.initial.revision, fixtureValue.target);
    expect((await waitForTerminal(fixtureValue.coordinator, started.id)).status).toBe("failed");
    expect(await readFile(path.join(fixtureValue.target, "foreign.txt"), "utf8")).toBe("owned by another operation");
    expect(fixtureValue.finish).toHaveBeenCalledOnce();
  });
});
