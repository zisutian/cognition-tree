// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, realpath, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRuntime } from "./runtimeManifest.mjs";

import { replaceFileDurably } from "../../infrastructure/server/persistence/index.ts";

async function writeRecord(file, value) {
  await replaceFileDurably(file, JSON.stringify(value, null, 2) + "\n");
}

function overlaps(a, b) { return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`); }
async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    // JSON parser messages may quote signing keys from damaged bootstrap files.
    if (error instanceof SyntaxError) throw new Error(`Invalid runtime metadata: ${file}`);
    throw error;
  }
}
async function assertStopped(root) {
  const bootstrap = await optionalJson(path.join(root, ".cognition-tree/bootstrap-v1/configuration.json"));
  const configuration = bootstrap?.configuration;
  if (bootstrap && (!Number.isInteger(configuration?.port) || configuration.port < 1 || configuration.port > 65535 || !path.isAbsolute(configuration.dataRoot))) {
    throw new Error("Cannot establish runtime configuration; repair it before installation");
  }
  const port = configuration?.port ?? 3001;
  const listening = await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", error => error.code === "ECONNREFUSED" ? resolve(false) : reject(error));
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error("Cannot prove service has stopped")); });
  });
  if (listening) throw new Error(`Stop the service on port ${port} before installing`);
  const migration = await optionalJson(path.join(root, ".cognition-tree/bootstrap-v1/data-root-migration-v1.json"));
  if (migration && (migration.formatVersion !== 1 || migration.current && !["completed", "failed"].includes(migration.current.status))) {
    throw new Error("Finish data-root migration recovery before installing");
  }
  return configuration?.dataRoot ?? path.join(root, ".cognition-tree");
}

/** An interrupted installation keeps its lock and complete backup. Recovery never rewinds data. */
export async function installRuntime(candidate, target, backupRoot, { onPhase = async () => {} } = {}) {
  candidate = await realpath(candidate); target = await realpath(target);
  const manifest = await verifyRuntime(candidate);
  const dataRoot = await assertStopped(target);
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  backupRoot = await realpath(backupRoot);
  if (overlaps(candidate, target) || overlaps(backupRoot, target) || overlaps(backupRoot, candidate) || overlaps(backupRoot, dataRoot)) throw new Error("Runtime, candidate and backup paths must be separate");
  const originalEntries = (await readdir(target)).filter(name => name !== ".cognition-tree").sort();
  if (originalEntries.length) await verifyRuntime(target, { installed: true });
  const lock = path.join(path.dirname(target), `.${path.basename(target)}.release-lock`);
  await mkdir(lock, { mode: 0o700 });
  const backup = path.join(backupRoot, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`);
  await mkdir(backup, { mode: 0o700 });
  const record = { formatVersion: 1, phase: "backing-up", target, backup, commit: manifest.commit, originalEntries, incomingEntries: (await readdir(candidate)).sort(), dataRoot };
  const recordFile = path.join(backup, "installation.json");
  try {
    await writeRecord(path.join(lock, "owner.json"), { backup });
    await writeRecord(recordFile, record);
    await cp(target, path.join(backup, "runtime"), { recursive: true, preserveTimestamps: true });
    if (dataRoot !== path.join(target, ".cognition-tree")) {
      await cp(dataRoot, path.join(backup, "external-data"), { recursive: true, preserveTimestamps: true });
    }
    await cp(candidate, path.join(backup, "incoming"), { recursive: true, preserveTimestamps: true });
    await verifyRuntime(path.join(backup, "incoming"));
    record.phase = "prepared"; await writeRecord(recordFile, record); await onPhase(record.phase);
    await assertStopped(target);
    record.phase = "installing"; await writeRecord(recordFile, record);
    for (const name of originalEntries) await rm(path.join(target, name), { recursive: true, force: true });
    for (const name of record.incomingEntries) await cp(path.join(backup, "incoming", name), path.join(target, name), { recursive: true, preserveTimestamps: true });
    await onPhase(record.phase);
    await verifyRuntime(target, { installed: true });
    record.phase = "completed"; await writeRecord(recordFile, record);
    await rm(lock, { recursive: true });
    await rm(path.join(backup, "incoming"), { recursive: true });
    return { backup, commit: manifest.commit };
  } catch (error) {
    throw new Error(`Installation incomplete; preserve data and run release:recover ${backup}`, { cause: error });
  }
}

export async function recoverInstallation(backup) {
  backup = await realpath(backup);
  const record = await optionalJson(path.join(backup, "installation.json"));
  if (!record || record.formatVersion !== 1 || record.backup !== backup || !path.isAbsolute(record.target)) throw new Error("Invalid installation record");
  const target = await realpath(record.target);
  const lock = path.join(path.dirname(target), `.${path.basename(target)}.release-lock`);
  const owner = await optionalJson(path.join(lock, "owner.json"));
  if (!owner) {
    if (["completed", "recovered"].includes(record.phase)) return record.phase;
    throw new Error("Installation lock is missing; authority cannot be established");
  }
  if (owner.backup !== backup) throw new Error("Another installation owns this runtime");
  await assertStopped(target);
  if (record.phase === "installing") {
    if (record.originalEntries.length) await verifyRuntime(path.join(backup, "runtime"), { installed: true });
    const names = new Set([...record.originalEntries, ...record.incomingEntries]);
    for (const name of names) {
      if (name === ".cognition-tree" || name.includes("/") || name === "." || name === "..") throw new Error("Invalid payload path in installation record");
    }
    for (const name of names) await rm(path.join(target, name), { recursive: true, force: true });
    for (const name of record.originalEntries) await cp(path.join(backup, "runtime", name), path.join(target, name), { recursive: true, preserveTimestamps: true });
    if (record.originalEntries.length) await verifyRuntime(target, { installed: true });
  } else if (record.phase === "completed") {
    await verifyRuntime(target, { installed: true });
  } else if (!["backing-up", "prepared", "recovered"].includes(record.phase)) throw new Error("Unknown installation phase");
  if (record.phase !== "completed") record.phase = "recovered";
  await writeRecord(path.join(backup, "installation.json"), record);
  await rm(lock, { recursive: true });
  return record.phase;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) throw new Error("Usage: pnpm release:install <package> <runtime-directory> <backup-directory>");
  const result = await installRuntime(...process.argv.slice(2).map(value => path.resolve(value)));
  console.log(`Runtime installed; start with ./start.sh\nSource: ${result.commit}\nBackup: ${result.backup}`);
}
