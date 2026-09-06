// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentDeviceLoginProcessPort } from "../../../application/agentHost/deviceLoginPorts.ts";
import { CodexAppServerClient } from "./codexAppServerClient.ts";
import { resolveCodexEntrypoint } from "./codexPackage.ts";
import { withRuntimeTimeout } from "./runtimeTimeout.ts";

async function cleanupCodexLoginDirectory(directory: string) {
  const resolved = path.resolve(directory);
  const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-codex-login-`;
  if (!resolved.startsWith(prefix)) {
    throw new Error("Refusing to clean an unexpected Codex login directory");
  }
  await rm(resolved, { force: true, recursive: true });
}

function verifiedDeviceLoginUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Codex returned an invalid device login URL");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Codex returned an invalid device login URL"); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Codex returned an invalid device login URL");
  }
  return url.toString();
}

export function createDeviceLoginProcessPort({
  projectRoot,
  cleanupDirectory = cleanupCodexLoginDirectory,
}: {
  projectRoot: string;
  cleanupDirectory?: (directory: string) => Promise<void>;
}): AgentDeviceLoginProcessPort {
  return {
    async create(credentialHome) {
      const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-codex-login-"));
      try {
        const entrypoint = await resolveCodexEntrypoint(projectRoot);
        const child = spawn(process.execPath, [entrypoint, "app-server"], {
          cwd: directory,
          env: {
            CODEX_HOME: credentialHome,
            HOME: credentialHome,
            LANG: "C.UTF-8",
            PATH: path.dirname(process.execPath),
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
        const client = new CodexAppServerClient(child);
        let stopPromise: Promise<void> | null = null;
        let spawnFailed = false;
        child.once("error", () => { if (child.pid === undefined) spawnFailed = true; });
        const hasExited = () => spawnFailed || child.exitCode !== null || child.signalCode !== null;
        const request = (method: string, params: unknown, label: string) =>
          withRuntimeTimeout(client.request(method, params), 5_000, label);

        return {
          async initialize() {
            await request("initialize", {
              capabilities: { experimentalApi: true },
              clientInfo: { name: "cognition_tree", title: "Cognition Tree", version: "0.1.0" },
            }, "Codex device login initialize timed out");
            client.notify("initialized", {});
          },
          async start() {
            const response = await request("account/login/start", { type: "chatgptDeviceCode" }, "Codex device login start timed out");
            const value = response && typeof response === "object" && !Array.isArray(response)
              ? response as Record<string, unknown> : null;
            if (value?.type !== "chatgptDeviceCode" || typeof value.loginId !== "string" || !value.loginId || typeof value.userCode !== "string" || !value.userCode) {
              throw new Error("Codex returned an invalid device login response");
            }
            return { loginId: value.loginId, userCode: value.userCode, verificationUrl: verifiedDeviceLoginUrl(value.verificationUrl) };
          },
          subscribe(listener) {
            client.subscribe(message => {
              if (message.method !== "account/login/completed") return;
              const value = message.params && typeof message.params === "object" && !Array.isArray(message.params)
                ? message.params as Record<string, unknown> : null;
              if (!value || (value.loginId !== null && typeof value.loginId !== "string")) return;
              listener({ loginId: value.loginId, success: value.success === true, error: typeof value.error === "string" ? value.error : null });
            });
          },
          async cancel(loginId) {
            await request("account/login/cancel", { loginId }, "Codex device login cancellation timed out");
          },
          hasExited,
          onExit(listener) {
            child.once("exit", listener);
            child.once("error", () => { if (child.pid === undefined) listener(); });
          },
          stop() {
            stopPromise ??= (async () => {
              if (hasExited()) return;
              child.kill("SIGTERM");
              await new Promise<void>(resolve => {
                const timeout = setTimeout(() => {
                  child.kill("SIGKILL");
                }, 2_000);
                timeout.unref();
                const finish = () => { clearTimeout(timeout); resolve(); };
                child.once("exit", finish);
                child.once("error", () => { if (child.pid === undefined) finish(); });
              });
            })();
            return stopPromise;
          },
          cleanup: () => cleanupDirectory(directory),
        };
      } catch (error) {
        await cleanupDirectory(directory);
        throw error;
      }
    },
  };
}
