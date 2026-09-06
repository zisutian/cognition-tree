// SPDX-License-Identifier: GPL-3.0-or-later

import { runDataRootMigrationRecoveryServer } from "./system/dataRootMigrationRecoveryServer.ts";
import { randomUUID } from "node:crypto";
import { FileDataRootMigrationRecordStore } from "./system/dataRootMigrationRecordStore.ts";
import { createDataRootMigrationFileOperations } from "./system/dataRootMigrationFiles.ts";
import { localRepositoryWriterLockName } from "./repository/repositoryRuntimeLayout.ts";
import { once } from "node:events";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import { AutomationTokenStore } from "./access/automationTokenStore.ts";
import { AgentConfigurationStore } from "./agent/configurationStore.ts";
import { OperationLedger } from "./operations/operationLedger.ts";
import { TrustedClientTokenStore } from "./access/trustedClientTokenStore.ts";
import { AgentProviderOperations } from "./agent/providerOperations.ts";
import { AgentProviderTargetPolicy } from "./agent/providerTargetPolicy.ts";
import { AgentService } from "./agent/service.ts";
import { agentServicePolicy } from "./agent/servicePolicy.ts";
import { createApiServer } from "./api/http/server.ts";
import { ApiMaintenanceGate } from "./api/http/maintenanceGate.ts";
import {
  closeApiServer,
  settleApiServerLifecycleOperations,
  settleApiServerLifecyclePhases,
} from "./api/http/serverLifecycle.ts";
import { systemApiRuntime } from "./api/http/runtime.ts";
import { createApiSecurityPolicy } from "./api/http/security.ts";
import { ApiSearchService } from "./api/search.ts";
import { ApiEventHub } from "./api/sync/events.ts";
import { ApiRevisionTracker } from "./api/sync/revisionTracker.ts";
import { createStaticClientRuntime } from "./client/staticClientRuntime.ts";
import { BuiltInCatalog } from "./repository/built-ins/catalog.ts";
import { LocalRepositoryCatalog } from
  "./repository/workspace/local/localRepositoryCatalog.ts";
import { BootstrapConfigurationStore } from "./system/bootstrapConfigurationStore.ts";
import { DataRootMigrationCoordinator } from "../../application/system/dataRootMigrationCoordinator.ts";
import { SystemAdministrationService } from "../../application/system/systemAdministrationService.ts";
import { runBootstrapRecoveryServer } from "./system/recoveryServer.ts";

const dataRootMigrationFileOperations = createDataRootMigrationFileOperations(localRepositoryWriterLockName);




























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
      hmr: { server },
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
const bootstrapStore = new BootstrapConfigurationStore(projectRoot);
const maintenanceGate = new ApiMaintenanceGate();
let shutdown: () => Promise<void> = async () => undefined;
let hasActiveAgentWork = () => false;
const migrationRecords = new FileDataRootMigrationRecordStore(path.join(projectRoot, ".cognition-tree", "bootstrap-v1"));
const migrations = new DataRootMigrationCoordinator({
  hasActiveAgentWork: () => hasActiveAgentWork(),
  createId: randomUUID,
  files: dataRootMigrationFileOperations,
  records: migrationRecords,
  bootstrap: bootstrapStore,
  controlRoot: path.join(projectRoot, ".cognition-tree", "bootstrap-v1"),
  maintenance: maintenanceGate,
  requestRestart: async () => {
    process.exitCode = 75;
    await shutdown();
  },
});
const bootstrapSnapshot = await (async () => {
  let migrationObserved = false;
  let migrationPending = false;
  try {
    const record = await migrationRecords.load();
    migrationObserved = true;
    migrationPending = record !== null && record.status !== "failed" && record.status !== "completed";
    const recovered = await migrations.recoverOnStartup();
    if (recovered?.status === "recovery-required") {
      await runDataRootMigrationRecoveryServer({ migrations, failure: null });
      return null;
    }
    return await bootstrapStore.readSnapshot();
  } catch (failure) {
    if (!migrationObserved || migrationPending) {
      await runDataRootMigrationRecoveryServer({ migrations, failure });
    } else {
      await runBootstrapRecoveryServer({ bootstrap: bootstrapStore, failure });
    }
    return null;
  }
})();

if (bootstrapSnapshot !== null) {
const effectiveConfiguration = bootstrapSnapshot.configuration;
const host = effectiveConfiguration.listenMode === "loopback"
  ? "127.0.0.1"
  : "0.0.0.0";
const port = effectiveConfiguration.port;
const repositoryRoot = path.join(
  effectiveConfiguration.dataRoot,
  "repositories",
);
const repositoryHostRoot = effectiveConfiguration.repositoryHostRoot;
const serverStateDirectory = path.join(
  effectiveConfiguration.dataRoot,
  "server",
);
const security = createApiSecurityPolicy({
  ownerSessions: bootstrapStore,
  port,
  publicOrigin: effectiveConfiguration.publicOrigin,
});
const catalog = new LocalRepositoryCatalog(repositoryRoot, {
  hostRoot: repositoryHostRoot,
});
const builtInCatalog = new BuiltInCatalog(repositoryRoot);

await catalog.initialize();
await builtInCatalog.initialize();

const accessStore = new AutomationTokenStore(serverStateDirectory);
const trustedClientTokenStore = new TrustedClientTokenStore(serverStateDirectory);
const agentTargetPolicy = new AgentProviderTargetPolicy();
const agentConfigurationStore = new AgentConfigurationStore(
  serverStateDirectory,
  { targetPolicy: agentTargetPolicy },
);
const operationLedger = new OperationLedger(
  serverStateDirectory,
  effectiveConfiguration.maxAuditEntries,
);
await operationLedger.initialize();
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
  targetPolicy: agentTargetPolicy,
});
const agentProviderOperations = new AgentProviderOperations({
  configurationStore: agentConfigurationStore,
  projectRoot,
  runtime: systemApiRuntime,
  targetPolicy: agentTargetPolicy,
});
hasActiveAgentWork = () => agentService.hasResidentSessions() || agentProviderOperations.hasActiveOperations();
let clientRuntime: ClientRuntime | null = null;

const systemAdministration = new SystemAdministrationService({
  bootstrap: bootstrapStore,
  effectiveConfiguration,
  ledger: operationLedger,
  migrations,
});
const requestConfiguredRestart = () => {
  process.exitCode = 75;
  void shutdown().catch((error: unknown) => {
    console.error("Failed to restart Cognition Tree", error);
    process.exitCode = 1;
  });
};
const server = createApiServer({
  accessStore,
  agentConfigurationStore,
  agentProviderOperations,
  agentService,
  builtInCatalog,
  catalog,
  eventHub,
  maintenanceGate,
  operationLedger,
  revisionTracker,
  requestRestart: requestConfiguredRestart,
  security,
  stateDirectory: serverStateDirectory,
  systemAdministration,
  trustedClientTokenStore,
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
  await agentProviderOperations.dispose();
  await agentService.dispose();
  await catalog.dispose();
  throw error;
}

const agentStatus = await agentService.status();
let shutdownPromise: Promise<void> | null = null;
shutdown = () => {
  shutdownPromise ??= settleApiServerLifecyclePhases([
    [() => closeApiServer({
      closeLongLivedConnections: () => {
        eventHub.dispose();
        agentService.closeEventStreams();
      },
      closeOwnedResources: () => settleApiServerLifecycleOperations([
        () => agentProviderOperations.dispose(),
        () => agentService.dispose(),
        () => clientRuntime?.dispose() ?? Promise.resolve(),
      ]),
      server,
    })],
    [() => catalog.dispose()],
  ]);
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
  `Agent profiles: ${agentStatus.enabled ? "available" : "unavailable"}`,
);
}
