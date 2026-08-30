// SPDX-License-Identifier: GPL-3.0-or-later

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
import {
  SystemMigrationConflictError,
  SystemMigrationValidationError,
} from "../../../../application/system/systemConfiguration.ts";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { FileDataRootMigrationCoordinator } from "../../../../infrastructure/server/system/dataRootMigrationCoordinator.ts";
import {
  dataRootMigrationFileOperations,
  type DataRootMigrationFileOperations,
} from "../../../../infrastructure/server/system/dataRootMigrationFiles.ts";

const roots: string[] = [];

async function fixture(
  hasResidentSessions = false,
  hasPendingCodexLogin = false,
  fileOperations: DataRootMigrationFileOperations =
    dataRootMigrationFileOperations,
) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-project-"));
  const targetParent = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-target-"));
  const bootstrap = new BootstrapConfigurationStore(projectRoot);
  const initial = await bootstrap.readSnapshot();
  const source = initial.configuration.dataRoot;
  const finish = vi.fn();
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
  const coordinator = new FileDataRootMigrationCoordinator({
    agentProviderOperations: { hasPendingCodexLogin: () => hasPendingCodexLogin },
    agentService: { hasResidentSessions: () => hasResidentSessions },
    bootstrap,
    controlRoot: path.join(projectRoot, ".cognition-tree", "bootstrap-v1"),
    fileOperations,
    maintenance: { begin: async () => ({ finish }) },
    requestRestart,
    restartDelayMilliseconds: 0,
  });

  return {
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
  coordinator: FileDataRootMigrationCoordinator,
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

  it("rolls back a failed copy without changing the bootstrap pointer", async () => {
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
    await expect(access(fixtureValue.target)).rejects.toMatchObject({ code: "ENOENT" });
    expect(fixtureValue.finish).toHaveBeenCalledOnce();
    expect(fixtureValue.requestRestart).not.toHaveBeenCalled();
  });

  it("records cleanup failure and releases maintenance after a failed copy", async () => {
    const cleanup = vi.fn(async () => {
      throw new Error("injected cleanup failure");
    });
    const fixtureValue = await fixture(false, false, {
      ...dataRootMigrationFileOperations,
      cleanup,
    });

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
      errorMessage: expect.stringContaining(
        "Destination cleanup failed: injected cleanup failure",
      ),
      status: "failed",
    });
    expect(terminal.errorMessage).toContain("Symbolic link is not allowed");
    expect(cleanup).toHaveBeenCalledWith(fixtureValue.target);
    expect(fixtureValue.finish).toHaveBeenCalledOnce();
    expect((await fixtureValue.bootstrap.readSnapshot()).configuration.dataRoot)
      .toBe(fixtureValue.source);
  });
});
