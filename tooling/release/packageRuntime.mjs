// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digestFile, inventoryRuntime, verifyRuntime } from "./runtimeManifest.mjs";
import { copyRuntimeFiles } from "./copyRuntimeFiles.mjs";
import { run } from "./process.mjs";

export async function packageRuntime(sourceRoot, destination) {
  const git = (...args) => execFileSync("git", args, { cwd: sourceRoot, encoding: "utf8" }).trim();
  if (git("status", "--porcelain")) throw new Error("Commit source changes before packaging");
  const commit = git("rev-parse", "HEAD");
  // Reserve the destination before building; never replace an occupied path.
  await mkdir(destination);
  const buildRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-runtime-build-"));
  try {
    const archive = path.join(buildRoot, "source.tar");
    execFileSync("git", ["archive", "--format=tar", "--output", archive, commit], { cwd: sourceRoot });
    await run("tar", ["-xf", archive, "-C", buildRoot], sourceRoot);
    await rm(archive);
    await run("pnpm", ["install", "--frozen-lockfile"], buildRoot, { env: { ...process.env, CI: "true" } });
    await run("pnpm", ["run", "build"], buildRoot);
    const build = path.join(destination, ".artifacts/build");
    await mkdir(build, { recursive: true });
    for (const name of ["client", "server"]) await copyRuntimeFiles(path.join(buildRoot, ".artifacts/build", name), path.join(build, name));
    for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "LICENSE"]) await copyRuntimeFiles(path.join(buildRoot, name), path.join(destination, name));
    await run("pnpm", ["install", "--prod", "--frozen-lockfile", "--ignore-scripts"], destination, { env: { ...process.env, CI: "true" } });
    await rm(path.join(destination, "pnpm-workspace.yaml"));
    const sourcePackage = JSON.parse(await readFile(path.join(buildRoot, "package.json"), "utf8"));
    const runtimePackage = Object.fromEntries(["name", "version", "description", "license", "type", "engines", "dependencies"].map(key => [key, sourcePackage[key]]));
    await writeFile(path.join(destination, "package.json"), JSON.stringify(runtimePackage, null, 2) + "\n");
    await mkdir(path.join(destination, "runtime"));
    for (const [source, target] of [["startProduction.sh", "start.sh"], ["ctnProduction.sh", "ctn"], ["supervise.sh", "runtime/supervise.sh"]]) {
      await copyRuntimeFiles(path.join(buildRoot, "tooling/runtime", source), path.join(destination, target));
      await chmod(path.join(destination, target), 0o755);
    }
    await copyRuntimeFiles(path.join(buildRoot, "tooling/release/runtime-readme.md"), path.join(destination, "README.md"));
    const manifest = {
      formatVersion: 1, commit, builtAt: new Date().toISOString(),
      nodeVersion: process.version, platform: process.platform, architecture: process.arch,
      lockfileSha256: await digestFile(path.join(destination, "pnpm-lock.yaml")),
      files: await inventoryRuntime(destination),
    };
    await writeFile(path.join(destination, "release.json.tmp"), JSON.stringify(manifest, null, 2) + "\n");
    await rename(path.join(destination, "release.json.tmp"), path.join(destination, "release.json"));
    await verifyRuntime(destination);
    return manifest;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  } finally { await rm(buildRoot, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: pnpm release:package <new-output-directory>");
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const destination = path.resolve(process.argv[2]);
  const result = await packageRuntime(root, destination);
  console.log(`Runtime package ready: ${destination}\nSource: ${result.commit}`);
}
