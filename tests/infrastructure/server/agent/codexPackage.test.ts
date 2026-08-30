// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  maximumCodexPackageMetadataBytes,
  pinnedCodexVersion,
  resolveCodexEntrypoint,
} from "../../../../infrastructure/server/agent/codexPackage.ts";

async function createPackageDirectory() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "codex-package-"));
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );

  await mkdir(packageDirectory, { recursive: true });
  return { packageDirectory, projectRoot };
}

describe("Codex package", () => {
  it("resolves the pinned package entrypoint", async () => {
    const { packageDirectory, projectRoot } = await createPackageDirectory();

    try {
      await writeFile(path.join(packageDirectory, "package.json"), JSON.stringify({
        version: pinnedCodexVersion,
      }));
      await expect(resolveCodexEntrypoint(projectRoot)).resolves.toBe(
        path.join(packageDirectory, "bin", "codex.js"),
      );
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects oversized or invalid UTF-8 package metadata", async () => {
    for (const content of [
      Buffer.alloc(maximumCodexPackageMetadataBytes + 1, 0x20),
      Buffer.from([0xff]),
    ]) {
      const { packageDirectory, projectRoot } = await createPackageDirectory();

      try {
        await writeFile(path.join(packageDirectory, "package.json"), content);
        await expect(resolveCodexEntrypoint(projectRoot)).rejects.toThrow(
          "package metadata is invalid",
        );
      } finally {
        await rm(projectRoot, { force: true, recursive: true });
      }
    }
  });

  it("does not follow a package metadata symbolic link", async () => {
    const { packageDirectory, projectRoot } = await createPackageDirectory();
    const target = path.join(projectRoot, "redirected-package.json");

    try {
      await writeFile(target, JSON.stringify({ version: pinnedCodexVersion }));
      await symlink(target, path.join(packageDirectory, "package.json"));
      await expect(resolveCodexEntrypoint(projectRoot)).rejects.toThrow(
        "package metadata is invalid",
      );
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });
});
