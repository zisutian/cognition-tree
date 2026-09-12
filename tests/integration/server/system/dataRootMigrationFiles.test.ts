// SPDX-License-Identifier: GPL-3.0-or-later

import { localRepositoryWriterLockName } from "../../../../infrastructure/server/repository/repositoryRuntimeLayout.ts";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDataRootMigrationFileOperations,
} from "../../../../infrastructure/server/system/dataRootMigrationFiles.ts";

const dataRootMigrationFileOperations = createDataRootMigrationFileOperations(localRepositoryWriterLockName);







describe("data-root migration files", () => {
  it("streams authoritative content and metadata verification", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-files-"));
    const source = path.join(root, "source");
    const control = path.join(root, "control");
    const destination = path.join(root, "destination");
    const relative = path.join("server", "access-v1", "tokens.json");
    const preservedTime = new Date("2026-08-01T01:02:03.000Z");

    try {
      await mkdir(path.join(source, "server", "access-v1"), {
        recursive: true,
      });
      await mkdir(control);
      const sourceFile = path.join(source, relative);
      const destinationFile = path.join(destination, relative);

      await writeFile(sourceFile, Buffer.alloc(2 * 1024 * 1024), {
        mode: 0o600,
      });
      await utimes(sourceFile, preservedTime, preservedTime);
      await dataRootMigrationFileOperations.prepareDestination(
        destination,
        source,
        control,
      );
      await dataRootMigrationFileOperations.copy(await dataRootMigrationFileOperations.identify(source), destination, async () => undefined);
      await expect(dataRootMigrationFileOperations.verify(
        await dataRootMigrationFileOperations.identify(source),
        await dataRootMigrationFileOperations.identify(destination),
      )).resolves.toMatch(/^sha256:/);

      await chmod(destinationFile, 0o644);
      await expect(dataRootMigrationFileOperations.verify(
        await dataRootMigrationFileOperations.identify(source),
        await dataRootMigrationFileOperations.identify(destination),
      )).rejects.toThrow(/verification failed/i);
      await chmod(destinationFile, 0o600);
      await utimes(
        destinationFile,
        new Date("2026-08-02T01:02:03.000Z"),
        new Date("2026-08-02T01:02:03.000Z"),
      );
      await expect(dataRootMigrationFileOperations.verify(
        await dataRootMigrationFileOperations.identify(source),
        await dataRootMigrationFileOperations.identify(destination),
      )).rejects.toThrow(/verification failed/i);
      await utimes(destinationFile, preservedTime, preservedTime);
      await writeFile(destinationFile, "changed");
      await expect(dataRootMigrationFileOperations.verify(
        await dataRootMigrationFileOperations.identify(source),
        await dataRootMigrationFileOperations.identify(destination),
      )).rejects.toThrow(/verification failed/i);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not follow a destination that appears after preparation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-race-"));
    const source = path.join(root, "source");
    const control = path.join(root, "control");
    const destination = path.join(root, "destination");
    const redirected = path.join(root, "redirected");
    const relative = path.join("repositories", "primary", "note.ctn");

    try {
      await mkdir(path.join(source, "repositories", "primary"), {
        recursive: true,
      });
      await mkdir(control);
      await mkdir(redirected);
      await writeFile(path.join(source, relative), "authoritative");
      await dataRootMigrationFileOperations.prepareDestination(
        destination,
        source,
        control,
      );
      await symlink(redirected, destination);

      await expect(dataRootMigrationFileOperations.copy(await dataRootMigrationFileOperations.identify(source), destination, async () => undefined))
        .rejects.toThrow(/destination appeared/i);
      await expect(access(path.join(redirected, relative))).rejects
        .toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
