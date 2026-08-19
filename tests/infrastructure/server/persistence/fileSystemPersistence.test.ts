// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSecureDirectory,
  isSecureRegularFile,
  removeDurableWriteTemporaryFiles,
  replaceFileDurably,
  replaceJsonDurably,
} from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";

describe("filesystem persistence primitives", () => {
  it("durably replaces files and removes its temporary file", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-durable-write-"));
    const filePath = path.join(rootDir, "note.ctn");

    try {
      await writeFile(filePath, "old", "utf8");
      await replaceFileDurably(filePath, "new");

      expect(await readFile(filePath, "utf8")).toBe("new");
      expect(await readdir(rootDir)).toEqual(["note.ctn"]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it("writes canonical JSON and cleans abandoned temporary files recursively", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-durable-json-"));
    const nested = path.join(rootDir, "nested");
    const filePath = path.join(rootDir, "workspace.json");
    const temporaryName =
      "content.json.123.00000000-0000-4000-8000-000000000001.tmp";

    try {
      await mkdir(nested);
      await replaceJsonDurably(filePath, { id: "workspace" });
      await writeFile(path.join(nested, temporaryName), "orphan", "utf8");
      await writeFile(path.join(nested, "keep.tmp"), "keep", "utf8");
      await removeDurableWriteTemporaryFiles(rootDir);

      expect(await readFile(filePath, "utf8")).toBe(
        '{\n  "id": "workspace"\n}\n',
      );
      expect(await readdir(nested)).toEqual(["keep.tmp"]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it("recognizes only private regular files and directories", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-secure-file-"));
    const privateDirectory = path.join(rootDir, "private");
    const privateFile = path.join(privateDirectory, "content.json");
    const linkedFile = path.join(privateDirectory, "linked.json");

    try {
      await mkdir(privateDirectory, { mode: 0o700 });
      await writeFile(privateFile, "{}", { mode: 0o600 });
      await symlink(privateFile, linkedFile);

      expect(isSecureDirectory(await lstat(privateDirectory))).toBe(true);
      expect(isSecureRegularFile(await lstat(privateFile))).toBe(true);
      expect(isSecureRegularFile(await lstat(linkedFile))).toBe(false);
      await chmod(privateFile, 0o644);
      expect(isSecureRegularFile(await lstat(privateFile))).toBe(false);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
