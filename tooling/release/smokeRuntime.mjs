// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { BootstrapConfigurationStore } from "../../infrastructure/server/system/index.ts";
import { chromium } from "@playwright/test";
import { copyRuntimeFiles } from "./copyRuntimeFiles.mjs";
import { verifyRuntime } from "./runtimeManifest.mjs";
import { verifyLocalContent } from "./verifyLocalContent.mjs";

if (process.argv.length !== 3) throw new Error("Usage: pnpm release:smoke <runtime-package>");
const candidate = path.resolve(process.argv[2]);
await verifyRuntime(candidate);
const fixture = await mkdtemp(path.join(os.tmpdir(), "ctn-packaged-smoke-"));
const commands = await mkdtemp(path.join(os.tmpdir(), "ctn-runtime-commands-"));
let child;
let browser;
try {
  await copyRuntimeFiles(candidate, fixture);
  await verifyRuntime(fixture);
  const compiled = path.join(fixture, ".artifacts/build/server");
  const store = new BootstrapConfigurationStore(fixture);
  const initial = await store.readSnapshot();
  const reservation = net.createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  await store.update(initial.revision, { listenMode: "loopback", port, maxAuditEntries: 1000, publicOrigin: null, repositoryHostRoot: null });
  for (const [name, target] of [["node", process.execPath], ["bash", "/bin/bash"], ["dirname", "/usr/bin/dirname"], ["basename", "/usr/bin/basename"]]) await symlink(target, path.join(commands, name));
  // Only the runtime's Node and system shell are exposed to the service.
  child = spawn("/bin/bash", ["./start.sh"], { cwd: fixture, env: { ...process.env, PATH: commands, NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-6000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (true) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Packaged service exited before readiness: ${output}`);
    try { if ((await fetch(`${origin}/api/v4/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* wait for listening */ }
    if (Date.now() >= deadline) throw new Error(`Packaged service did not become ready: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  for (const endpoint of ["/", "/api/v4/openapi.json", "/api/v4/capabilities"]) {
    assert.equal((await fetch(origin + endpoint)).status, 200, endpoint);
  }
  const cli = spawnSync("/bin/bash", ["./ctn", "--help"], { cwd: fixture, encoding: "utf8" });
  assert.equal(cli.status, 0); assert.match(cli.stdout, /--server/);
  assert.doesNotMatch(cli.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  await verifyLocalContent({ directory: fixture, origin });
  const codex = spawnSync(process.execPath, ["node_modules/@openai/codex/bin/codex.js", "--version"], { cwd: fixture, encoding: "utf8", timeout: 10000 });
  assert.equal(codex.status, 0, "Pinned Codex executable must run from the package");
  const privateTool = spawnSync(process.execPath, [path.join(compiled, "infrastructure/server/agent/sessionMcpServer.js")], { cwd: fixture, encoding: "utf8", timeout: 10000 });
  assert.notEqual(privateTool.status, 0);
  assert.match(privateTool.stderr, /private IPC environment is incomplete/);
  assert.doesNotMatch(privateTool.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("heading", { name: "工作台布局", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  const geometry = await page.evaluate(() => {
    const theme = getComputedStyle(document.documentElement);
    return {
      row: Number.parseFloat(theme.getPropertyValue("--ui-row-height")),
      header: Number.parseFloat(theme.getPropertyValue("--ui-panel-header-height")),
      fields: [...document.querySelectorAll("input.ui-control")]
        .map(element => element.getBoundingClientRect().height),
      headers: [...document.querySelectorAll("[data-region-header]")]
        .map(element => element.getBoundingClientRect().height),
    };
  });
  assert.ok(geometry.row > 0 && geometry.header > 0, "Generated design tokens must reach the packaged browser");
  assert.ok(geometry.fields.length > 0 && geometry.headers.length > 0);
  for (const height of geometry.fields) assert.equal(height, geometry.row);
  for (const height of geometry.headers) assert.equal(height, geometry.header);
  console.log(`Packaged UI geometry verified: rows ${geometry.row}px; headers ${geometry.header}px.`);
  assert.deepEqual(pageErrors, []);
  await browser.close(); browser = null;
  const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
  assert.equal(child.exitCode, 130);
  console.log("Packaged runtime passed: HTTP, Chromium, CLI content queries/edits/receipts, retired credential rejection, Codex executable, private tool entry and graceful shutdown; temporary data only.");
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
  }
  await rm(fixture, { recursive: true, force: true });
  await rm(commands, { recursive: true, force: true });
}
