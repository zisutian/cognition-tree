// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  writeFileAtomically,
  writeJsonAtomically,
} from "../../server/atomicWrite.ts";

describe("atomic file writes", () => {
  it("replaces files and removes temporary files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-atomic-write-"));
    const filePath = path.join(rootDir, "note.ctn");

    try {
      await writeFile(filePath, "old", "utf8");
      await writeFileAtomically(filePath, "new");

      expect(await readFile(filePath, "utf8")).toBe("new");
      expect(await readdir(rootDir)).toEqual(["note.ctn"]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it("writes formatted JSON with a trailing newline", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-atomic-json-"));
    const filePath = path.join(rootDir, "workspace.json");

    try {
      await writeJsonAtomically(filePath, { id: "workspace" });

      expect(await readFile(filePath, "utf8")).toBe(
        '{\n  "id": "workspace"\n}\n',
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
