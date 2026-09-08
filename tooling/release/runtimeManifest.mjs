// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath } from "node:fs/promises";
import path from "node:path";

export async function digestFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inventoryRuntime(root, { installed = false } = {}) {
  const canonicalRoot = await realpath(root);
  const entries = [];
  async function walk(relative) {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) {
      const target = await readlink(absolute);
      const canonical = await realpath(absolute);
      if (path.isAbsolute(target) || !canonical.startsWith(`${canonicalRoot}${path.sep}`)) {
        throw new Error(`Runtime link escapes package: ${relative}`);
      }
      entries.push({ path: relative, type: "link", target });
    } else if (stat.isDirectory()) {
      entries.push({ path: relative, type: "directory", mode });
      for (const name of (await readdir(absolute)).sort()) await walk(`${relative}/${name}`);
    } else if (stat.isFile()) {
      entries.push({ path: relative, type: "file", mode, sha256: await digestFile(absolute) });
    } else throw new Error(`Unsupported runtime file: ${relative}`);
  }
  for (const name of (await readdir(root)).sort()) {
    if (name === "release.json" || installed && name === ".cognition-tree") continue;
    if (![".artifacts", "node_modules", "runtime", "start.sh", "ctn", "package.json", "pnpm-lock.yaml", "README.md", "LICENSE"].includes(name)) {
      throw new Error(`Unexpected runtime entry: ${name}`);
    }
    await walk(name);
  }
  return entries;
}

export async function verifyRuntime(root, options) {
  const manifest = JSON.parse(await readFile(path.join(root, "release.json"), "utf8"));
  if (manifest.formatVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commit) ||
      !/^[a-f0-9]{64}$/.test(manifest.lockfileSha256) ||
      manifest.platform !== process.platform || manifest.architecture !== process.arch) {
    throw new Error("Invalid or incompatible runtime manifest");
  }
  const files = await inventoryRuntime(root, options);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error("Runtime integrity verification failed");
  if (await digestFile(path.join(root, "pnpm-lock.yaml")) !== manifest.lockfileSha256) throw new Error("Runtime lockfile does not match source");
  for (const required of ["start.sh", "ctn", "runtime/supervise.sh", ".artifacts/build/client/index.html", ".artifacts/build/server/infrastructure/server/index.js", ".artifacts/build/server/infrastructure/server/agent/sessionMcpServer.js", ".artifacts/build/server/tooling/cli/ctnCli.js", "node_modules/@openai/codex/package.json"]) {
    if (!(await lstat(path.join(root, required))).isFile()) throw new Error(`Missing runtime file: ${required}`);
  }
  return manifest;
}
