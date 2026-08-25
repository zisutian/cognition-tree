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
} from "../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";
import { BuiltInCatalog } from "../../infrastructure/server/repository/built-ins/catalog.ts";
import { AgentOperationLedger } from "../../infrastructure/server/agent/operationLedger.ts";
import { AgentService } from "../../infrastructure/server/agent/service.ts";
import { agentServicePolicy } from "../../infrastructure/server/agent/servicePolicy.ts";
import { ApiEventHub } from "../../infrastructure/server/api/sync/events.ts";
import { ApiRevisionTracker } from "../../infrastructure/server/api/sync/revisionTracker.ts";
import { ApiSearchService } from "../../infrastructure/server/api/search.ts";
import { systemApiRuntime } from "../../infrastructure/server/api/http/runtime.ts";
import {
  createE2EAgentRuntime,
  createE2EAgentConfigurationStore,
} from "./fakeAgentRuntime.ts";
import { BootstrapConfigurationStore } from "../../infrastructure/server/system/bootstrapConfigurationStore.ts";
import { SystemAdministrationService } from "../../infrastructure/server/system/systemAdministrationService.ts";

const host = "127.0.0.1";

type E2ERuntime = {
  agentService: AgentService;
  apiHandler: ApiRequestHandler;
  catalog: LocalRepositoryCatalog;
};

export type E2EWorkspaceServer = {
  baseUrl: string;
  close(): Promise<void>;
  repositoryDirectory: string;
  reset(): Promise<void>;
};

export async function startE2EWorkspaceServer({
  repositoryHostRoot = "/host/e2e-repositories",
  rootDirectory,
}: {
  repositoryHostRoot?: string | null;
  rootDirectory: string;
}): Promise<E2EWorkspaceServer> {
  const repositoryDirectory = path.join(rootDirectory, "repositories");
  const serverStateDirectory = path.join(rootDirectory, "server");
  const bootstrap = new BootstrapConfigurationStore(rootDirectory);
  const bootstrapInitial = await bootstrap.readSnapshot();
  const bootstrapSnapshot = await bootstrap.setDataRoot(
    bootstrapInitial.revision,
    rootDirectory,
  );
  const security = {
    ...createApiSecurityPolicy({
      ownerSessions: bootstrap,
      port: 3_001,
      publicOrigin: null,
    }),
    allowedOrigins: [] as string[],
  };

  async function createRuntime(): Promise<E2ERuntime> {
    const catalog = new LocalRepositoryCatalog(repositoryDirectory, {
      hostRoot: repositoryHostRoot,
    });
    const builtInCatalog = new BuiltInCatalog(repositoryDirectory);

    await catalog.initialize();
    await builtInCatalog.initialize();
    const eventHub = new ApiEventHub();
    const revisionTracker = new ApiRevisionTracker();
    const operationLedger = new AgentOperationLedger(
      serverStateDirectory,
      bootstrapSnapshot.configuration.maxAuditEntries,
    );
    const agentConfigurationStore = await createE2EAgentConfigurationStore(
      serverStateDirectory,
    );
    const agentService = new AgentService({
      builtInCatalog,
      catalog,
      configurationStore: agentConfigurationStore,
      eventHub,
      ledger: operationLedger,
      revisionTracker,
      runtime: systemApiRuntime,
      runtimeFactory: createE2EAgentRuntime,
      search: new ApiSearchService({ builtInCatalog, catalog }),
      servicePolicy: agentServicePolicy,
    });

    return {
      agentService,
      apiHandler: createApiRequestHandler({
        agentConfigurationStore,
        agentService,
        builtInCatalog,
        catalog,
        eventHub,
        operationLedger,
        revisionTracker,
        security,
        stateDirectory: serverStateDirectory,
        systemAdministration: new SystemAdministrationService({
          bootstrap,
          effectiveConfiguration: bootstrapSnapshot.configuration,
          ledger: operationLedger,
          migrations: {
            get: async () => {
              throw new Error("E2E migration status is unavailable");
            },
            start: async () => {
              throw new Error("E2E data-root migration is unavailable");
            },
          },
        }),
      }),
      catalog,
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
      await runtime.agentService.dispose();
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
      const descriptor = await runtime.catalog.createRepositoryWithId(
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

  let vite: import("vite").ViteDevServer | null = null;
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

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      void runtime.apiHandler(request, response);
      return;
    }
    if (!vite) {
      response.writeHead(503);
      response.end("E2E client is starting");
      return;
    }
    vite.middlewares(request, response, (error: unknown) => {
      if (error && !response.headersSent) {
        response.writeHead(500);
        response.end("E2E client failed");
      }
    });
  });

  const { createServer: createViteServer } = await import("vite");

  vite = await createViteServer({
    appType: "spa",
    server: { hmr: { server }, middlewareMode: { server } },
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
  const baseUrl = `http://${host}:${address.port}`;

  security.allowedOrigins.push(baseUrl);

  return {
    baseUrl,
    repositoryDirectory,
    reset: resetRuntime,
    async close() {
      await resetQueue;
      await vite?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await runtime.agentService.dispose();
      await runtime.catalog.dispose();
    },
  };
}
