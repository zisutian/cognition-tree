// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { AgentRuntimeProtocolError } from "../../../application/agent/agentRuntimePort.ts";

export const maximumCodexPackageMetadataBytes = 1024 * 1024;
export const pinnedCodexVersion = "0.148.0";

function invalidCodexPackage() {
  return new AgentRuntimeProtocolError("Codex package metadata is invalid");
}

async function readCodexPackageMetadata(filePath: string) {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    const before = await handle.stat();

    if (!before.isFile() || before.size > maximumCodexPackageMetadataBytes) {
      throw invalidCodexPackage();
    }
    const chunks: Buffer[] = [];
    let size = 0;

    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(
        64 * 1024,
        maximumCodexPackageMetadataBytes - size + 1,
      ));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);

      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maximumCodexPackageMetadataBytes) {
        throw invalidCodexPackage();
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const after = await handle.stat();

    if (
      !after.isFile() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw invalidCodexPackage();
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, size),
      );
    } catch {
      throw invalidCodexPackage();
    }
  } finally {
    await handle.close();
  }
}

export async function resolveCodexEntrypoint(projectRoot: string) {
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );
  let parsedPackageJson: unknown;

  try {
    parsedPackageJson = JSON.parse(await readCodexPackageMetadata(
      path.join(packageDirectory, "package.json"),
    )) as unknown;
  } catch (error) {
    if (error instanceof AgentRuntimeProtocolError) throw error;
    throw invalidCodexPackage();
  }
  const packageJson = parsedPackageJson &&
      typeof parsedPackageJson === "object" &&
      !Array.isArray(parsedPackageJson)
    ? parsedPackageJson as Record<string, unknown>
    : null;

  if (packageJson?.version !== pinnedCodexVersion) {
    throw new AgentRuntimeProtocolError(
      `Codex package version must be exactly ${pinnedCodexVersion}`,
    );
  }
  return path.join(packageDirectory, "bin", "codex.js");
}
