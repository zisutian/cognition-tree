import { createContent } from "../../application/workspace/session/workspaceSessionTestFixture.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cliMaximumCredentialFileBytes,
  CliCredentialStore,
} from "../../../tooling/cli/credentialStore.ts";
import { runCtnCli } from "../../../tooling/cli/ctnCli.ts";
import {
  cliMaximumJsonResponseBytes,
  CliApiError,
  CliHttpClient,
  normalizeCliOrigin,
} from "../../../tooling/cli/httpClient.ts";

const roots: string[] = [];
const revisionA = `sha256:${"a".repeat(64)}` as const;
const revisionB = `sha256:${"b".repeat(64)}` as const;

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-cli-"));

  roots.push(root);
  return root;
}

async function configuredStore(root: string) {
  const store = new CliCredentialStore(
    path.join(root, "cognition-tree", "cli-v1", "credentials.json"),
  );

  await store.write({
    defaultProfile: "local",
    formatVersion: 1,
    profiles: [{
      name: "local",
      origin: "http://127.0.0.1:3001",
      secret: "ctt_secret",
    }],
  });
  return store;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })
  ));
});

describe("trusted-client CLI security", () => {
  it("accepts HTTPS and strict loopback HTTP origins only", () => {
    expect(normalizeCliOrigin("https://tree.example.test")).toBe(
      "https://tree.example.test",
    );
    expect(normalizeCliOrigin("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001",
    );
    expect(normalizeCliOrigin("http://localhost:3001")).toBe(
      "http://localhost:3001",
    );
    expect(normalizeCliOrigin("http://[::1]:3001")).toBe(
      "http://[::1]:3001",
    );
    for (const origin of [
      "http://192.168.1.10:3001",
      "https://user:password@tree.example.test",
      "https://tree.example.test/api",
      "https://tree.example.test/?token=secret",
      "https://tree.example.test/#fragment",
    ]) {
      expect(() => normalizeCliOrigin(origin)).toThrow();
    }
  });

  it("does not follow redirects or allow a request path to escape API v4", async () => {
    const fetch = vi.fn(async (
      _input: URL | RequestInfo,
      _init?: RequestInit,
    ) => new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
    const client = new CliHttpClient({
      fetch: fetch as typeof globalThis.fetch,
      origin: "https://tree.example.test",
      secret: "ctt_secret",
    });

    await expect(client.request("GET", "/api/v4/capabilities")).resolves.toEqual({
      ok: true,
    });
    const [, init] = fetch.mock.calls[0] ?? [];

    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer ctt_secret",
    );
    await expect(client.request("GET", "/api/v4/../admin")).rejects.toThrow(
      "cannot escape /api/v4",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized CLI API response declaration", async () => {
    const client = new CliHttpClient({
      fetch: async () => new Response("{}", {
        headers: {
          "Content-Length": String(cliMaximumJsonResponseBytes + 1),
          "Content-Type": "application/json",
        },
      }),
      origin: "https://tree.example.test",
      secret: "ctt_secret",
    });

    await expect(client.request("GET", "/api/v4/capabilities"))
      .rejects.toThrow(/exceeds the size limit/i);
  });

  it("persists credentials with private permissions and rejects symlinks", async () => {
    const root = await temporaryRoot();
    const file = path.join(
      root,
      "cognition-tree",
      "cli-v1",
      "credentials.json",
    );
    const store = new CliCredentialStore(file);

    await store.write({
      defaultProfile: "local",
      formatVersion: 1,
      profiles: [{
        name: "local",
        origin: "http://127.0.0.1:3001",
        secret: "ctt_secret",
      }],
    });
    expect((await lstat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect((await lstat(file)).mode & 0o777).toBe(0o600);

    const target = path.join(root, "target.json");

    await writeFile(target, "{}", { mode: 0o600 });
    await rm(file);
    await symlink(target, file);
    await expect(store.read()).rejects.toThrow();
  });

  it("rejects an oversized credential file before parsing it", async () => {
    const root = await temporaryRoot();
    const file = path.join(
      root,
      "cognition-tree",
      "cli-v1",
      "credentials.json",
    );
    const store = new CliCredentialStore(file);

    await store.read();
    await writeFile(file, "{}", { mode: 0o600 });
    await truncate(file, cliMaximumCredentialFileBytes + 1);
    await expect(store.read()).rejects.toThrow(/exceeds the size limit/i);
  });

  it("keeps profile secrets out of list output and leaves no fallback default", async () => {
    const root = await temporaryRoot();
    const store = new CliCredentialStore(
      path.join(root, "cognition-tree", "cli-v1", "credentials.json"),
    );
    const output: string[] = [];
    const error: string[] = [];
    const io = {
      error: (message: string) => error.push(message),
      output: (message: string) => output.push(message),
      readSecret: async () => "ctt_first_secret",
    };

    expect(await runCtnCli([
      "auth",
      "add",
      "--profile",
      "first",
      "--server",
      "http://127.0.0.1:3001",
    ], { credentialStore: store, io })).toBe(0);
    io.readSecret = async () => "ctt_second_secret";
    expect(await runCtnCli([
      "auth",
      "add",
      "--profile",
      "second",
      "--server",
      "https://tree.example.test",
    ], { credentialStore: store, io })).toBe(0);
    output.length = 0;
    expect(await runCtnCli(["auth", "list"], {
      credentialStore: store,
      io,
    })).toBe(0);
    expect(output.join("\n")).not.toContain("ctt_");
    expect(await runCtnCli([
      "auth",
      "remove",
      "--profile",
      "first",
    ], { credentialStore: store, io })).toBe(0);
    expect((await store.read()).defaultProfile).toBeNull();
    expect(error).toEqual([]);
  });

  it("rejects a non trusted-client secret before persisting a profile", async () => {
    const root = await temporaryRoot();
    const store = new CliCredentialStore(
      path.join(root, "cognition-tree", "cli-v1", "credentials.json"),
    );
    const errors: string[] = [];

    expect(await runCtnCli([
      "auth",
      "add",
      "--profile",
      "invalid",
      "--server",
      "https://tree.example.test",
    ], {
      credentialStore: store,
      io: {
        error: (message) => errors.push(message),
        output: () => undefined,
        readSecret: async () => "automation-token",
      },
    })).toBe(2);
    expect((await store.read()).profiles).toEqual([]);
    expect(errors.join("\n")).toContain("Trusted-client secret is invalid");
  });

  it("reconciles a committed write without replaying PUT", async () => {
    const root = await temporaryRoot();
    const store = await configuredStore(root);
    const checkoutFile = path.join(root, "workspace-checkout.json");
    const initial = {
      base: { content: createContent("base"), revision: revisionA },
      content: createContent("committed"),
    };

    await writeFile(checkoutFile, `${JSON.stringify(initial, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(checkoutFile, 0o600);
    const request = vi.fn(async (method: string) => {
      if (method === "PUT") {
        throw new CliApiError(500, {
          code: "operation_audit_finalize_failed",
          details: {
            afterRevision: revisionB,
            commitState: "committed",
          },
          message: "Content committed, but audit finalization failed",
          requestId: "request-1",
          retryable: false,
        });
      }
      return {
        content: createContent("committed"),
        revision: revisionB,
      };
    });
    const output: string[] = [];
    const errors: string[] = [];
    const code = await runCtnCli([
      "sync",
      "commit",
      "workspace",
      "--repository",
      "primary",
      "--file",
      checkoutFile,
    ], {
      createClient: () => ({ request }),
      credentialStore: store,
      io: {
        error: (message) => errors.push(message),
        output: (message) => output.push(message),
        readSecret: async () => "unused",
      },
    });

    expect(code).toBe(6);
    expect(request.mock.calls.map(([method]) => method)).toEqual(["PUT", "GET"]);
    expect(JSON.parse(await readFile(checkoutFile, "utf8"))).toEqual({
      base: {
        content: createContent("committed"),
        revision: revisionB,
      },
      content: createContent("committed"),
    });
    expect(errors.join("\n")).toContain('"checkoutUpdated": true');
    expect(output).toEqual([]);
  });
});
