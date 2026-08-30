// SPDX-License-Identifier: GPL-3.0-or-later

import {
  access,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dataRootMigrationFileOperations,
} from "../../../../infrastructure/server/system/dataRootMigrationFiles.ts";

describe("data-root migration files", () => {
  it("streams authoritative file verification and detects divergence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-files-"));
    const source = path.join(root, "source");
    const control = path.join(root, "control");
    const destination = path.join(root, "destination");
    const relative = path.join("server", "access-v1", "tokens.json");

    try {
      await mkdir(path.join(source, "server", "access-v1"), {
        recursive: true,
      });
      await mkdir(control);
      await writeFile(path.join(source, relative), Buffer.alloc(2 * 1024 * 1024));
      await dataRootMigrationFileOperations.prepareDestination(
        destination,
        source,
        control,
      );
      await dataRootMigrationFileOperations.copy(source, destination);
      await expect(dataRootMigrationFileOperations.verify(
        source,
        destination,
      )).resolves.toBeUndefined();

      await writeFile(path.join(destination, relative), "changed");
      await expect(dataRootMigrationFileOperations.verify(
        source,
        destination,
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

      await expect(dataRootMigrationFileOperations.copy(source, destination))
        .rejects.toThrow(/destination appeared/i);
      await expect(access(path.join(redirected, relative))).rejects
        .toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
