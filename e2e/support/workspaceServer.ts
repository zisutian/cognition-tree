// SPDX-License-Identifier: GPL-3.0-or-later

import { rm } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import {
  createWorkspaceApiRequestHandler,
} from "../../server/api/workspaceApiServer.ts";
import {
  createWorkspaceApiSecurityPolicy,
} from "../../server/api/workspaceApiSecurity.ts";
import { LocalRepositoryCatalog } from "../../server/adapters/local/localRepositoryCatalog.ts";
import { WebDavConnectionRegistry } from "../../server/adapters/webdav/webDavConnectionRegistry.ts";
import { CompositeRepositoryCatalog } from "../../server/catalog/compositeRepositoryCatalog.ts";
import { SystemRepositoryCatalog } from "../../server/repository/systemRepositoryCatalog.ts";
import type { CreateLocalRepositoryWithId } from "../../server/adapters/local/localRepositoryCatalog.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3317");
const repositoryDir = path.resolve(
  process.env.CTN_E2E_REPOSITORY_DIR ??
    path.join(".cognition-tree", "e2e-repository"),
);
const serverStateDir = path.resolve(
  process.env.CTN_E2E_SERVER_STATE_DIR ??
    path.join(".cognition-tree", "e2e-server-state"),
);
const repositoryHostRoot = process.env.CTN_E2E_REPOSITORY_HOST_ROOT ?? null;
const security = {
  ...createWorkspaceApiSecurityPolicy({ host }),
  allowedOrigins: [
    process.env.CTN_E2E_WEB_ORIGIN ?? "http://127.0.0.1:4174",
  ],
};

await Promise.all([
  rm(repositoryDir, { force: true, recursive: true }),
  rm(serverStateDir, { force: true, recursive: true }),
]);

const localCatalog = new LocalRepositoryCatalog(repositoryDir, {
  hostRoot: repositoryHostRoot,
});
const webDavRegistry = new WebDavConnectionRegistry({
  stateDirectory: serverStateDir,
});
const catalog = new CompositeRepositoryCatalog(localCatalog, webDavRegistry);
const systemCatalog = new SystemRepositoryCatalog(serverStateDir);

await catalog.initialize();
await systemCatalog.initialize();

const workspaceApiHandler = createWorkspaceApiRequestHandler({
  catalog,
  security,
  systemCatalog,
});

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
    const descriptor = await localCatalog.createRepositoryWithId(
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

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (
    request.method === "POST" &&
    url.pathname === "/__e2e/local-repositories" &&
    url.search === ""
  ) {
    void handleSeedRequest(request, response);
    return;
  }

  void workspaceApiHandler(request, response);
});

server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;

server.listen(port, host, () => {
  console.log(`Cognition Tree E2E API listening on http://${host}:${port}`);
});

async function closeServer() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await catalog.dispose();
}

process.once("SIGINT", () => void closeServer());
process.once("SIGTERM", () => void closeServer());
