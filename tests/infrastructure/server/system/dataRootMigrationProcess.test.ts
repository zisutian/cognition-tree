// SPDX-License-Identifier: GPL-3.0-or-later

import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BootstrapConfigurationStore } from "../../../../infrastructure/server/system/bootstrapConfigurationStore.ts";

const roots: string[] = [];
const children = new Set<ChildProcess>();
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  children.delete(child);
}
function launch(root: string, target: string, mode: string, phase = "") {
  const child = fork(fileURLToPath(new URL("./fixtures/migrationProcess.ts", import.meta.url)), [root, target, mode, phase], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  children.add(child);
  let output = "";
  child.stderr!.on("data", (chunk) => { output += String(chunk); });
  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
    child.once("message", (value) => resolve(value as Record<string, unknown>));
    child.once("error", reject);
    child.once("exit", (code, signal) => reject(new Error(`Migration process exited ${code}/${signal}: ${output}`)));
  });
  return { child, result };
}
afterEach(async () => {
  await Promise.all([...children].map(kill));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("migration process interruption recovery", () => {
  it.each(["preparing", "allocated", "verifying", "committing", "restarting"])("recovers after termination at %s", async (phase) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-process-"));
    roots.push(root);
    const bootstrap = new BootstrapConfigurationStore(root);
    const source = (await bootstrap.readSnapshot()).configuration.dataRoot;
    const note = "repositories/primary/note.ctn";
    await mkdir(path.dirname(path.join(source, note)), { recursive: true, mode: 0o700 });
    await writeFile(path.join(source, note), ": preserved content\n", { mode: 0o600 });
    const target = path.join(root, "target");
    const started = launch(root, target, "start", phase);
    expect(await started.result).toEqual({ kind: "paused", phase });
    await kill(started.child);
    const recovered = launch(root, target, "recover");
    expect(await recovered.result).toMatchObject({
      kind: "recovered", closed: false, dataRoot: phase === "restarting" ? target : source,
      result: { status: phase === "restarting" ? "completed" : "failed", commitOutcome: phase === "restarting" ? "committed" : "not-committed" },
    });
    await kill(recovered.child);
    expect(await readFile(path.join(source, note), "utf8")).toBe(": preserved content\n");
    if (["verifying", "committing", "restarting"].includes(phase)) {
      expect(await readFile(path.join(target, note), "utf8")).toBe(": preserved content\n");
    }
    if (phase === "restarting") {
      // A completed record must not pin the old manifest after ordinary edits.
      await writeFile(path.join(target, note), ": edited after recovery\n", { mode: 0o600 });
      const next = launch(root, target, "recover");
      expect(await next.result).toMatchObject({ kind: "recovered", closed: false, dataRoot: target, result: { status: "completed" } });
    }
  }, 15_000);

  it("keeps writes closed after pointer replacement until the interrupted writer lock expires", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-migration-pointer-kill-"));
    roots.push(root);
    const bootstrap = new BootstrapConfigurationStore(root);
    const source = (await bootstrap.readSnapshot()).configuration.dataRoot;
    await mkdir(path.join(source, "repositories"), { mode: 0o700 });
    await writeFile(path.join(source, "repositories", "content"), "data", { mode: 0o600 });
    const target = path.join(root, "target");
    const started = launch(root, target, "start", "pointer-replaced");
    expect(await started.result).toMatchObject({ kind: "paused", phase: "pointer-replaced" });
    await kill(started.child);
    const blocked = launch(root, target, "recover");
    expect(await blocked.result).toMatchObject({ kind: "recovered", closed: true, result: { status: "recovery-required", commitOutcome: "unknown" } });
    await kill(blocked.child);
    // The production lock is retained, never deleted by recovery. Its 30 s
    // stale timeout must expire before the next process may establish authority.
    await new Promise((resolve) => setTimeout(resolve, 31_000));
    const recovered = launch(root, target, "recover");
    expect(await recovered.result).toMatchObject({ kind: "recovered", closed: false, dataRoot: target, result: { status: "completed", commitOutcome: "committed" } });
    expect(await readFile(path.join(source, "repositories", "content"), "utf8")).toBe("data");
    expect(await readFile(path.join(target, "repositories", "content"), "utf8")).toBe("data");
  }, 45_000);
});
