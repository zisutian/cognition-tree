// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BootstrapConfigurationStore } from "../../../infrastructure/server/system/index.ts";

const releaseUrl = new URL("../../../tooling/release/index.mjs", import.meta.url).href;
const { inventoryRuntime, verifyRuntime, digestFile, installRuntime, recoverInstallation } = await import(releaseUrl);
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-release-test-")); roots.push(root);
  const candidate = path.join(root, "candidate"); const target = path.join(root, "runtime");
  await mkdir(candidate); await mkdir(target);
  for (const file of ["start.sh", "ctn", "runtime/supervise.sh", ".artifacts/build/client/index.html", ".artifacts/build/server/infrastructure/server/index.js", ".artifacts/build/server/infrastructure/server/agent/sessionMcpServer.js", ".artifacts/build/server/tooling/cli/ctnCli.js", "node_modules/@openai/codex/package.json", "pnpm-lock.yaml", "package.json"]) {
    await mkdir(path.dirname(path.join(candidate, file)), { recursive: true });
    await writeFile(path.join(candidate, file), "fixture\n");
  }
  await mkdir(path.join(candidate, "node_modules/fixture-package"));
  await writeFile(path.join(candidate, "node_modules/fixture-package/index.js"), "export default true;\n");
  await symlink("fixture-package", path.join(candidate, "node_modules/fixture-link"));
  await seal(candidate, "a"); await cp(candidate, target, { recursive: true, verbatimSymlinks: true });
  const bootstrap = new BootstrapConfigurationStore(target); const initial = await bootstrap.readSnapshot();
  const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as net.AddressInfo).port; await new Promise<void>(resolve => server.close(() => resolve()));
  await bootstrap.update(initial.revision, { listenMode: "loopback", port, maxAuditEntries: 1000, publicOrigin: null, repositoryHostRoot: null });
  await writeFile(path.join(target, ".cognition-tree/content.txt"), "formal content");
  await writeFile(path.join(candidate, ".artifacts/build/client/index.html"), "new version"); await seal(candidate, "b");
  return { root, candidate, target, backups: path.join(root, "backups"), port };
}
async function seal(root: string, char: string) {
  await writeFile(path.join(root, "release.json"), JSON.stringify({ formatVersion: 1, commit: char.repeat(40), platform: process.platform, architecture: process.arch, lockfileSha256: await digestFile(path.join(root, "pnpm-lock.yaml")), files: await inventoryRuntime(root) }));
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("runtime integrity and installation", () => {
  it("rejects modified files, executable permissions and links to the developer directory", async () => {
    const { candidate, root } = await setup();
    await chmod(path.join(candidate, "start.sh"), 0o700);
    await expect(verifyRuntime(candidate)).rejects.toThrow("integrity");
    await seal(candidate, "b"); await writeFile(path.join(candidate, "start.sh"), "changed");
    await expect(verifyRuntime(candidate)).rejects.toThrow("integrity");
    await symlink(root, path.join(candidate, "node_modules/escape"));
    await expect(inventoryRuntime(candidate)).rejects.toThrow("escapes");
  });
  it("backs up the complete previous runtime and data, then installs without modifying content", async () => {
    const { candidate, target, backups } = await setup();
    const before = await readFile(path.join(target, ".cognition-tree/bootstrap-v1/configuration.json"));
    const result = await installRuntime(candidate, target, backups);
    expect((await verifyRuntime(target, { installed: true })).commit).toBe("b".repeat(40));
    expect((await verifyRuntime(path.join(result.backup, "runtime"), { installed: true })).commit).toBe("a".repeat(40));
    expect(await readFile(path.join(target, ".cognition-tree/bootstrap-v1/configuration.json"))).toEqual(before);
    expect(await readFile(path.join(result.backup, "runtime/.cognition-tree/content.txt"), "utf8")).toBe("formal content");
    expect(await recoverInstallation(result.backup)).toBe("completed");
  });
  it("keeps installed and backed-up dependency links independent of the candidate", async () => {
    const { candidate, target, backups } = await setup();
    const result = await installRuntime(candidate, target, backups);
    await rm(candidate, { recursive: true });
    for (const root of [target, path.join(result.backup, "runtime")]) {
      expect(await readlink(path.join(root, "node_modules/fixture-link"))).toBe("fixture-package");
      await verifyRuntime(root, { installed: true });
    }
  });
  it("refuses a running service and unknown files before altering the target", async () => {
    const { candidate, target, backups, port } = await setup();
    const server = net.createServer(); server.listen(port, "127.0.0.1"); await once(server, "listening");
    try { await expect(installRuntime(candidate, target, backups)).rejects.toThrow("Stop the service"); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    await writeFile(path.join(target, "unknown.txt"), "preserve me");
    await expect(installRuntime(candidate, target, backups)).rejects.toThrow("Unexpected runtime entry");
    expect(await readFile(path.join(target, "unknown.txt"), "utf8")).toBe("preserve me");
  });
  it.each(["copy", "verification"])("retains a recoverable backup after a real %s failure", async failure => {
    const { candidate, target, backups, root } = await setup();
    await expect(installRuntime(candidate, target, backups, {
      onPhase: async (phase: string) => {
        if (failure === "copy" && phase === "prepared") {
          const owner = JSON.parse(await readFile(path.join(root, ".runtime.release-lock/owner.json"), "utf8"));
          await rm(path.join(owner.backup, "incoming/start.sh"));
        } else if (failure === "verification" && phase === "installing") {
          await writeFile(path.join(target, ".artifacts/build/client/index.html"), "damaged transfer");
        }
      },
    })).rejects.toThrow("Installation incomplete");
    const owner = JSON.parse(await readFile(path.join(root, ".runtime.release-lock/owner.json"), "utf8"));
    expect(await recoverInstallation(owner.backup)).toBe("recovered");
    expect((await verifyRuntime(target, { installed: true })).commit).toBe("a".repeat(40));
    expect(await readFile(path.join(target, ".cognition-tree/content.txt"), "utf8")).toBe("formal content");
  });
  it("does not quote damaged private bootstrap contents in diagnostics", async () => {
    const { candidate, target, backups } = await setup();
    const marker = "private-test-marker";
    await writeFile(path.join(target, ".cognition-tree/bootstrap-v1/configuration.json"), `{${marker}`);
    let diagnostic = "";
    try { await installRuntime(candidate, target, backups); } catch (error) { diagnostic = String(error); }
    expect(diagnostic.includes(marker)).toBe(false);
    expect(diagnostic).toContain("Invalid runtime metadata");
  });
  it.each(["prepared", "installing"])("recovers after killing the installer at %s and permits repeated reconciliation", async phase => {
    const { candidate, target, backups, root } = await setup();
    const source = `import {installRuntime} from ${JSON.stringify(releaseUrl)};
      await installRuntime(${JSON.stringify(candidate)},${JSON.stringify(target)},${JSON.stringify(backups)}, {
        onPhase: async phase => { if(phase === ${JSON.stringify(phase)}) {console.log('INTERRUPT_READY'); await new Promise(()=>setInterval(()=>{},1000));} }
      });`;
    const file = path.join(root, "interrupt.mjs"); await writeFile(file, source);
    const child = spawn(process.execPath, [file], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await new Promise<void>((resolve, reject) => {
        let output = ""; child.stdout!.on("data", chunk => { output += chunk; if (output.includes("INTERRUPT_READY")) resolve(); });
        child.once("error", reject); child.once("exit", () => reject(new Error("Installer exited before phase barrier")));
      });
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    } finally { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited; } }
    const owner = JSON.parse(await readFile(path.join(root, ".runtime.release-lock/owner.json"), "utf8"));
    expect(await recoverInstallation(owner.backup)).toBe("recovered");
    expect(await recoverInstallation(owner.backup)).toBe("recovered");
    expect((await verifyRuntime(target, { installed: true })).commit).toBe("a".repeat(40));
    expect(await readFile(path.join(target, ".cognition-tree/content.txt"), "utf8")).toBe("formal content");
  });
});
