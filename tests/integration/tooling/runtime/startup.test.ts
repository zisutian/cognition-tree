// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const temporary: string[] = [];
const children: ChildProcess[] = [];
async function directory() {
  const value = await mkdtemp(path.join(os.tmpdir(), "ctn-launch-test-"));
  temporary.push(value);
  return value;
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
    }
  }
  await Promise.all(temporary.splice(0).map(value => rm(value, { recursive: true, force: true })));
});

describe("separate start entrypoints", () => {
  it("rejects mode switches in both directories before starting anything", async () => {
    const runtime = await directory();
    await cp(path.join(root, "tooling/runtime/startProduction.sh"), path.join(runtime, "start.sh"));
    for (const cwd of [root, runtime]) for (const flag of ["--development", "--production"]) {
      const result = spawnSync("bash", ["./start.sh", flag], { cwd, encoding: "utf8" });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("不接受参数");
    }
  });

  it("initializes only the development directory and preserves later configuration", async () => {
    const cwd = await directory();
    const script = path.join(root, "tooling/runtime/prepareDevelopment.ts");
    const first = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    expect(first.status, first.stderr).toBe(0);
    const file = path.join(cwd, ".cognition-tree/bootstrap-v1/configuration.json");
    const before = await readFile(file, "utf8");
    const state = JSON.parse(before);
    expect(state.configuration.port).toBe(3002);
    expect(state.configuration.dataRoot).toBe(path.join(cwd, ".cognition-tree"));
    const second = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    expect(second.status, second.stderr).toBe(0);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("restarts status 75 and drains the owned child on termination", async () => {
    const cwd = await directory();
    const fixture = path.join(cwd, "service.mjs");
    await writeFile(fixture, `import fs from 'node:fs';
      if (!fs.existsSync('restarted')) { fs.writeFileSync('restarted','yes'); process.exit(75); }
      process.on('SIGTERM',()=>{ fs.writeFileSync('stopped','yes'); process.exit(0); });
      console.log('SERVICE_READY'); setInterval(()=>{},1000);`);
    const child = spawn("bash", [path.join(root, "tooling/runtime/supervise.sh"), process.execPath, fixture], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      let output = "";
      child.stdout!.on("data", chunk => { output += chunk; if (output.includes("SERVICE_READY")) resolve(); });
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Service exited before readiness")));
    });
    const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
    expect(await readFile(path.join(cwd, "stopped"), "utf8")).toBe("yes");
  });
});
