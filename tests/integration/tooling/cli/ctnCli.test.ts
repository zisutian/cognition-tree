// SPDX-License-Identifier: GPL-3.0-or-later

import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiSecurityPolicy } from "../../../../infrastructure/server/api/http/security.ts";
import { createApiServer } from "../../../../infrastructure/server/runtime/apiRuntime.ts";
import { runCtnCli } from "../../../../tooling/cli/ctnCli.ts";
import {
  CliHttpClient,
  cliMaximumJsonResponseBytes,
  normalizeCliOrigin,
} from "../../../../tooling/cli/httpClient.ts";
import { createContentServiceFixture } from "../../server/operations/contentServiceFixture.ts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("local content CLI", () => {
  it("discovers domain commands and nested edits without a server or a second command catalog", async () => {
    const io = { error: vi.fn(), output: vi.fn() };
    const createClient = vi.fn();
    expect(await runCtnCli(["help", "todo"], { io, createClient })).toBe(0);
    expect(io.output.mock.lastCall![0]).toContain("set-completion");
    expect(io.output.mock.lastCall![0]).not.toContain("create-note");
    expect(
      await runCtnCli(["help", "replace-text"], { io, createClient }),
    ).toBe(0);
    expect(
      JSON.parse(io.output.mock.lastCall![0]).properties.replacements.items
        .required,
    ).toEqual(["oldText", "newText"]);
    expect(await runCtnCli(["apply", "--help"], { io, createClient })).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("rejects malformed or oversized stdin before opening a connection", async () => {
    const createClient = vi.fn(() => ({ request: vi.fn() }));
    for (const bytes of [
      Buffer.from("{"),
      Buffer.from([0xff]),
      Buffer.alloc(4 * 1024 * 1024 + 1),
    ]) {
      expect(
        await runCtnCli(
          ["--server", "http://localhost:3001", "apply", "--file", "-"],
          {
            createClient,
            stdin: Readable.from([bytes]),
            io: { error() {}, output() {} },
          },
        ),
      ).toBe(2);
    }
    for (const result of createClient.mock.results)
      expect(result.value.request).not.toHaveBeenCalled();
  });
  it("accepts only explicit local HTTP or HTTPS origins", () => {
    expect(() => normalizeCliOrigin("https://tree.example.test")).toThrow();
    expect(normalizeCliOrigin("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001",
    );
    expect(normalizeCliOrigin("http://localhost:3001")).toBe(
      "http://localhost:3001",
    );
    expect(normalizeCliOrigin("http://[::1]:3001")).toBe("http://[::1]:3001");
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
    const fetch = vi.fn(
      async (_input: URL | RequestInfo, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    );
    const client = new CliHttpClient({
      fetch: fetch as typeof globalThis.fetch,
      origin: "http://localhost:3001",
    });

    await expect(
      client.request("GET", "/api/v4/capabilities"),
    ).resolves.toEqual({ status: 200, body: { ok: true } });
    const [, init] = fetch.mock.calls[0] ?? [];

    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    await expect(client.request("GET", "/api/v4/../admin")).rejects.toThrow(
      "cannot escape /api/v4",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized CLI API response declaration", async () => {
    const client = new CliHttpClient({
      fetch: async () =>
        new Response("{}", {
          headers: {
            "Content-Length": String(cliMaximumJsonResponseBytes + 1),
            "Content-Type": "application/json",
          },
        }),
      origin: "http://localhost:3001",
    });

    await expect(client.request("GET", "/api/v4/capabilities")).rejects.toThrow(
      /exceeds the size limit/i,
    );
  });

  it("requires explicit origin and refuses the retired auth, sync and raw request commands", async () => {
    const io = { error: vi.fn(), output: vi.fn() };
    expect(await runCtnCli(["catalog"], { io })).toBe(2);
    for (const command of ["auth", "sync", "request"])
      expect(
        await runCtnCli(["--server", "http://localhost:3001", command], { io }),
      ).toBe(2);
    expect(
      await runCtnCli(
        ["--server", "http://localhost:3001", "directory", "workspace"],
        { io },
      ),
    ).toBe(2);
  });

  it("queries by name, submits through real HTTP, and queries a committed receipt after the caller loses the response", async () => {
    const fixture = await createContentServiceFixture();
    cleanup.push(() => fixture.dispose());
    const server = createApiServer({
      catalog: fixture.catalog,
      builtInCatalog: fixture.builtIns,
      contentService: fixture.service,
      operationLedger: fixture.ledger,
      stateDirectory: path.join(fixture.root, "server-state"),
      security: createApiSecurityPolicy({
        port: 3001,
        publicOrigin: null,
        ownerSessions: {
          createOwnerSessionForSecret: async () => null,
          verifyOwnerSession: async () => false,
        },
      }),
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    cleanup.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server address");
    const origin = `http://127.0.0.1:${address.port}`;
    const io = { error: vi.fn(), output: vi.fn() };
    const args = ["--server", origin];
    expect(await runCtnCli([...args, "openapi", "--content"], { io })).toBe(0);
    const contentContract = JSON.parse(io.output.mock.lastCall![0]);
    expect(Object.keys(contentContract.paths)).toHaveLength(3);
    expect(
      contentContract.paths["/api/v4/content/operations"].post.responses["409"]
        .content["application/json"].schema.$ref,
    ).toMatch(/^#\/components\/schemas\//);
    expect(await runCtnCli([...args, "catalog"], { io })).toBe(0);
    const catalog = JSON.parse(io.output.mock.lastCall![0]);
    const operationId = randomUUID();
    const file = path.join(fixture.root, "operation.json");
    await writeFile(
      file,
      JSON.stringify({
        operationId,
        scope: { domain: "catalog" },
        basis: catalog.basis,
        command: { kind: "create-repository", name: "学习资料" },
      }),
    );
    const client = new CliHttpClient({ origin });
    const request = vi.fn(
      async (method: string, endpoint: string, body?: unknown) => {
        const result = await client.request(method, endpoint, body);
        if (method === "POST")
          throw new TypeError("Connection lost after commit");
        return result;
      },
    );
    expect(
      await runCtnCli([...args, "apply", "--file", file], {
        io,
        createClient: () => ({ request }),
      }),
    ).toBe(6);
    expect(request).toHaveBeenCalledTimes(1);
    expect(io.error.mock.calls.flat().join(" ")).toContain(operationId);
    expect(await runCtnCli([...args, "result", operationId], { io })).toBe(0);
    expect(JSON.parse(io.output.mock.lastCall![0])).toMatchObject({
      operationId,
      status: "committed",
    });
    expect(
      (await fixture.catalog.listRepositories()).repositories,
    ).toHaveLength(1);
    await fixture.apply(
      { domain: "workspace", repository: "学习资料" },
      {
        kind: "create-note",
        parent: null,
        title: "操作系统",
        body: "- 进程管理",
      },
    );
    expect(
      await runCtnCli(
        [
          ...args,
          "read",
          "workspace",
          "--repository",
          "学习资料",
          "--resource",
          "操作系统",
        ],
        { io },
      ),
    ).toBe(0);
    const note = JSON.parse(io.output.mock.lastCall![0]);
    expect(note.document.editableText).toBe("- 进程管理");
    expect(note.basis.baseRevision).toMatch(/^sha256:/);
    const readFile = path.join(fixture.root, "read.json");
    await writeFile(readFile, JSON.stringify(note));
    const command = {
      kind: "edit-content",
      resource: "操作系统",
      edit: {
        kind: "replace-text",
        blockId: null,
        replacements: [{ oldText: "进程管理", newText: "进程调度" }],
      },
    };
    const published: string[] = [];
    const captured = {
      error: (message: string) => {
        published.push(message);
        io.error(message);
      },
      output: io.output,
    };
    const observed = {
      request: async (method: string, endpoint: string, body?: unknown) => {
        const id = (body as { operationId: string }).operationId;
        expect(published.some((message) => message.includes(id))).toBe(true);
        expect(body).toMatchObject({
          basis: note.basis,
          scope: note.scope,
          command,
        });
        return client.request(method, endpoint, body);
      },
    };
    expect(
      await runCtnCli([...args, "apply", "--from", readFile, "--file", "-"], {
        io: captured,
        stdin: Readable.from([Buffer.from(JSON.stringify(command))]),
        createClient: () => observed,
      }),
    ).toBe(0);
    const written = JSON.parse(io.output.mock.lastCall![0]);
    expect(written.status).toBe("committed");
    expect(
      await runCtnCli(
        [
          ...args,
          "apply",
          "--from",
          readFile,
          "--file",
          "-",
          "--id",
          written.operationId,
        ],
        { io, stdin: Readable.from([Buffer.from(JSON.stringify(command))]) },
      ),
    ).toBe(0);
    expect(JSON.parse(io.output.mock.lastCall![0])).toEqual(written);
    expect(
      await runCtnCli([...args, "apply", "--from", readFile, "--file", "-"], {
        io,
        stdin: Readable.from([Buffer.from(JSON.stringify(command))]),
      }),
    ).toBe(4);
    expect(JSON.parse(io.output.mock.lastCall![0])).toMatchObject({
      status: "conflict",
      error: { code: "revision_conflict" },
    });
    expect(
      (
        await fixture.read(
          { domain: "workspace", repository: "学习资料" },
          "操作系统",
        )
      ).document.editableText,
    ).toBe("- 进程调度");
  });
});
