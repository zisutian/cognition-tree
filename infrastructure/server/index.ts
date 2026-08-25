// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import { AutomationTokenStore } from "./access/automationTokenStore.ts";
import { AgentConfigurationStore } from "./agent/configurationStore.ts";
import { AgentOperationLedger } from "./agent/operationLedger.ts";
import { AgentProviderOperations } from "./agent/providerOperations.ts";
import { parseAgentPrivateTargets } from "./agent/providerTargetPolicy.ts";
import { AgentService } from "./agent/service.ts";
import { loadAgentServicePolicy } from "./agent/servicePolicy.ts";
import { createApiServer } from "./api/http/server.ts";
import { closeApiServer } from "./api/http/serverLifecycle.ts";
import { systemApiRuntime } from "./api/http/runtime.ts";
import { createApiSecurityPolicy } from "./api/http/security.ts";
import { ApiSearchService } from "./api/search.ts";
import { ApiEventHub } from "./api/sync/events.ts";
import { ApiRevisionTracker } from "./api/sync/revisionTracker.ts";
import { createStaticClientRuntime } from "./client/staticClientRuntime.ts";
import { BuiltInCatalog } from "./repository/built-ins/catalog.ts";
import { LocalRepositoryCatalog } from
  "./repository/workspace/local/localRepositoryCatalog.ts";

type ClientRuntime = {
  dispose(): Promise<void>;
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
};

async function createDevelopmentClientRuntime(
  server: Server,
): Promise<ClientRuntime> {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    appType: "spa",
    server: {
      middlewareMode: { server },
    },
  });

  return {
    dispose: () => vite.close(),
    handle: (request, response) =>
      new Promise<void>((resolve, reject) => {
        vite.middlewares(request, response, (error: unknown) => {
          if (error) {
            reject(error);
            return;
          }
          if (!response.headersSent) {
            response.writeHead(404, {
              "Content-Type": "text/plain; charset=utf-8",
            });
            response.end("Not found");
          }
          resolve();
        });
        response.once("finish", resolve);
        response.once("close", resolve);
      }),
  };
}

const commandArguments = process.argv.slice(2);
const development = commandArguments.length === 1 &&
  commandArguments[0] === "--development";

if (commandArguments.length > 0 && !development) {
  throw new Error(`Unsupported server arguments: ${commandArguments.join(" ")}`);
}

const projectRoot = process.cwd();
const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryRoot = process.env.CTN_REPOSITORY_ROOT ??
  path.join(projectRoot, ".cognition-tree", "repositories");
const repositoryHostRootValue = process.env.CTN_REPOSITORY_HOST_ROOT?.trim();
const repositoryHostRoot = repositoryHostRootValue
  ? repositoryHostRootValue
  : null;

if (repositoryHostRoot !== null && !path.isAbsolute(repositoryHostRoot)) {
  throw new Error("CTN_REPOSITORY_HOST_ROOT must be an absolute path");
}
const serverStateDirectory = process.env.CTN_SERVER_STATE_DIR ??
  path.join(projectRoot, ".cognition-tree", "server");
const security = createApiSecurityPolicy({
  bearerToken: process.env.CTN_API_TOKEN,
  host,
  publicUrl: process.env.CTN_PUBLIC_URL,
});
const catalog = new LocalRepositoryCatalog(repositoryRoot, {
  hostRoot: repositoryHostRoot,
});
const builtInCatalog = new BuiltInCatalog(repositoryRoot);

await catalog.initialize();
await builtInCatalog.initialize();

const accessStore = new AutomationTokenStore(serverStateDirectory);
const agentTargetPolicy = parseAgentPrivateTargets(
  process.env.CTN_AGENT_PRIVATE_TARGETS,
);
const agentConfigurationStore = new AgentConfigurationStore(
  serverStateDirectory,
  { targetPolicy: agentTargetPolicy },
);
const agentServicePolicy = loadAgentServicePolicy(
  process.env.CTN_AGENT_MAX_AUDIT_ENTRIES,
);
const operationLedger = agentServicePolicy.maxAuditEntries === null
  ? null
  : new AgentOperationLedger(
      serverStateDirectory,
      agentServicePolicy.maxAuditEntries,
    );
const eventHub = new ApiEventHub();
const revisionTracker = new ApiRevisionTracker();
const search = new ApiSearchService({ builtInCatalog, catalog });
const agentService = new AgentService({
  builtInCatalog,
  catalog,
  configurationStore: agentConfigurationStore,
  eventHub,
  ledger: operationLedger,
  revisionTracker,
  runtime: systemApiRuntime,
  search,
  servicePolicy: agentServicePolicy,
});
const agentProviderOperations = new AgentProviderOperations({
  configurationStore: agentConfigurationStore,
  runtime: systemApiRuntime,
  targetPolicy: agentTargetPolicy,
});
let clientRuntime: ClientRuntime | null = null;
const server = createApiServer({
  accessStore,
  agentConfigurationStore,
  agentProviderOperations,
  agentService,
  builtInCatalog,
  catalog,
  eventHub,
  operationLedger,
  revisionTracker,
  security,
  stateDirectory: serverStateDirectory,
}, async (request, response) => {
  if (!clientRuntime) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Client runtime is starting");
    return;
  }
  await clientRuntime.handle(request, response);
});

try {
  clientRuntime = development
    ? await createDevelopmentClientRuntime(server)
    : await createStaticClientRuntime(
        path.join(projectRoot, ".artifacts", "build", "client"),
      );
} catch (error) {
  await agentService.dispose();
  await catalog.dispose();
  throw error;
}

const agentStatus = await agentService.status();
let shutdownPromise: Promise<void> | null = null;
const shutdown = () => {
  shutdownPromise ??= (async () => {
    try {
      await closeApiServer({
        closeOwnedResources: async () => {
          eventHub.dispose();
          await Promise.all([
            agentService.dispose(),
            clientRuntime?.dispose() ?? Promise.resolve(),
          ]);
        },
        server,
      });
    } finally {
      await catalog.dispose();
    }
  })();
  return shutdownPromise;
};
let shutdownRequested = false;
const requestShutdown = () => {
  if (shutdownRequested) return;
  shutdownRequested = true;
  void shutdown().catch((error: unknown) => {
    console.error("Failed to shut down Cognition Tree", error);
    process.exitCode = 1;
  });
};

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

server.listen(port, host);
await once(server, "listening");
console.log(`Cognition Tree listening on http://${host}:${port}`);
console.log(`Local repository root: ${catalog.rootPath}`);
console.log(`Built-in data root: ${path.join(catalog.rootPath, ".built-ins")}`);
console.log(`Server state: ${serverStateDirectory}`);
console.log(`Allowed hosts: ${security.allowedHosts.join(", ")}`);
console.log(`Allowed origins: ${security.allowedOrigins.join(", ") || "none"}`);
console.log(
  `Bearer authentication: ${security.requiresBearerToken ? "required" : "disabled"}`,
);
console.log(
  `Agent profiles: ${agentStatus.enabled ? "available" : "unavailable"}`,
);
