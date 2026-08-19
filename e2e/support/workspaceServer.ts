// SPDX-License-Identifier: GPL-3.0-or-later

import { rm } from "node:fs/promises";
import http, {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  createApiRequestHandler,
  type ApiRequestHandler,
} from "../../infrastructure/server/api/http/server.ts";
import {
  createApiSecurityPolicy,
} from "../../infrastructure/server/api/http/security.ts";
import {
  LocalRepositoryCatalog,
  type CreateLocalRepositoryWithId,
} from "../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import { WebDavConnectionRegistry } from "../../infrastructure/server/adapters/webdav/webDavConnectionRegistry.ts";
import { CompositeRepositoryCatalog } from "../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";
import { BuiltInCatalog } from "../../infrastructure/server/repository/built-ins/catalog.ts";

const host = "127.0.0.1";

type E2ERuntime = {
  apiHandler: ApiRequestHandler;
  catalog: CompositeRepositoryCatalog;
  localCatalog: LocalRepositoryCatalog;
};

export type E2EWorkspaceServer = {
  baseUrl: string;
  close(): Promise<void>;
  repositoryDirectory: string;
  reset(): Promise<void>;
};

export async function startE2EWorkspaceServer({
  allowedOrigin,
  repositoryHostRoot = "/host/e2e-repositories",
  rootDirectory,
}: {
  allowedOrigin: string;
  repositoryHostRoot?: string | null;
  rootDirectory: string;
}): Promise<E2EWorkspaceServer> {
  const repositoryDirectory = path.join(rootDirectory, "repositories");
  const serverStateDirectory = path.join(rootDirectory, "server");
  const security = {
    ...createApiSecurityPolicy({ host }),
    allowedOrigins: [allowedOrigin],
  };

  async function createRuntime(): Promise<E2ERuntime> {
    const localCatalog = new LocalRepositoryCatalog(repositoryDirectory, {
      hostRoot: repositoryHostRoot,
    });
    const webDavRegistry = new WebDavConnectionRegistry({
      stateDirectory: serverStateDirectory,
    });
    const catalog = new CompositeRepositoryCatalog(localCatalog, webDavRegistry);
    const builtInCatalog = new BuiltInCatalog(repositoryDirectory);

    await catalog.initialize();
    await builtInCatalog.initialize();
    return {
      apiHandler: createApiRequestHandler({
        builtInCatalog,
        catalog,
        security,
        stateDirectory: serverStateDirectory,
      }),
      catalog,
      localCatalog,
    };
  }

  async function clearState() {
    await Promise.all([
      rm(repositoryDirectory, { force: true, recursive: true }),
      rm(serverStateDirectory, { force: true, recursive: true }),
    ]);
  }

  await clearState();
  let runtime = await createRuntime();
  let resetQueue = Promise.resolve();

  async function resetRuntime() {
    const reset = resetQueue.then(async () => {
      await runtime.catalog.dispose();
      await clearState();
      runtime = await createRuntime();
    });

    resetQueue = reset.catch(() => undefined);
    await reset;
  }

  async function readSeedRequest(request: IncomingMessage) {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as
      CreateLocalRepositoryWithId;
  }

  async function handleSeedRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    try {
      const descriptor = await runtime.localCatalog.createRepositoryWithId(
        await readSeedRequest(request),
      );

      response.writeHead(201, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(descriptor));
    } catch (error) {
      response.writeHead(400, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        message: error instanceof Error ? error.message : "Seed failed",
      }));
    }
  }

  async function handleResetRequest(response: ServerResponse) {
    try {
      await resetRuntime();
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
    } catch (error) {
      response.writeHead(500, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        message: error instanceof Error ? error.message : "Reset failed",
      }));
    }
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (
      request.method === "POST" &&
      url.pathname === "/__e2e/reset" &&
      url.search === ""
    ) {
      void handleResetRequest(response);
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/__e2e/local-repositories" &&
      url.search === ""
    ) {
      void handleSeedRequest(request, response);
      return;
    }

    void runtime.apiHandler(request, response);
  });

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://${host}:${address.port}`,
    repositoryDirectory,
    reset: resetRuntime,
    async close() {
      await resetQueue;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await runtime.catalog.dispose();
    },
  };
}
