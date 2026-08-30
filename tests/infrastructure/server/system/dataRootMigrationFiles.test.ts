// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
