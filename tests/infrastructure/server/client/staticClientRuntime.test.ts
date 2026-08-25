// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStaticClientRuntime } from
  "../../../../infrastructure/server/client/staticClientRuntime.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

async function createFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "ctn-static-client-"));
  const root = path.join(parent, "client");

  temporaryDirectories.push(parent);
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "index.html"), "<main>认知树</main>");
  await writeFile(path.join(root, "assets", "app.js"), "export const ready = true;");
  await writeFile(path.join(parent, "secret.txt"), "must-not-leak");
  const runtime = await createStaticClientRuntime(root);
  const server = createServer((incoming, outgoing) => {
    void runtime.handle(incoming, outgoing);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { runtime, server };
}

async function fetchFrom(
  server: ReturnType<typeof createServer>,
  requestPath: string,
  method = "GET",
) {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected an IP server address");
  }
  return await new Promise<{
    body: string;
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
  }>((resolve, reject) => {
    const outgoing = request({
      host: "127.0.0.1",
      method,
      path: requestPath,
      port: address.port,
    }, (incoming) => {
      incoming.setEncoding("utf8");
      let body = "";

      incoming.on("data", (chunk: string) => {
        body += chunk;
      });
      incoming.once("end", () => resolve({
        body,
        headers: incoming.headers,
        statusCode: incoming.statusCode ?? 0,
      }));
    });

    outgoing.once("error", reject);
    outgoing.end();
  });
}

describe("static client runtime", () => {
  it("serves client assets and uses index.html for application routes", async () => {
    const fixture = await createFixture();

    try {
      await expect(fetchFrom(fixture.server, "/")).resolves.toMatchObject({
        body: "<main>认知树</main>",
        statusCode: 200,
      });
      await expect(fetchFrom(fixture.server, "/assets/app.js")).resolves
        .toMatchObject({
          body: "export const ready = true;",
          headers: { "content-type": "text/javascript; charset=utf-8" },
          statusCode: 200,
        });
      await expect(fetchFrom(fixture.server, "/settings/service")).resolves
        .toMatchObject({
          body: "<main>认知树</main>",
          statusCode: 200,
        });
    } finally {
      fixture.server.closeAllConnections();
      fixture.server.close();
      await fixture.runtime.dispose();
    }
  });

  it("does not traverse outside the client build and handles HEAD", async () => {
    const fixture = await createFixture();

    try {
      const traversal = await fetchFrom(
        fixture.server,
        "/%2e%2e%2fsecret.txt",
      );
      const head = await fetchFrom(fixture.server, "/assets/app.js", "HEAD");

      expect(traversal.body).toBe("<main>认知树</main>");
      expect(traversal.body).not.toContain("must-not-leak");
      expect(head).toMatchObject({ body: "", statusCode: 200 });
    } finally {
      fixture.server.closeAllConnections();
      fixture.server.close();
      await fixture.runtime.dispose();
    }
  });
});
