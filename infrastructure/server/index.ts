// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createApiServer,
} from "./api/http/server.ts";
import {
  createApiSecurityPolicy,
} from "./api/http/security.ts";
import { LocalRepositoryCatalog } from
  "./repository/workspace/local/localRepositoryCatalog.ts";
import { BuiltInCatalog } from "./repository/built-ins/catalog.ts";
import { AutomationTokenStore } from "./access/automationTokenStore.ts";
import { AgentOperationLedger } from "./agent/operationLedger.ts";
import { AgentConfigurationStore } from "./agent/configurationStore.ts";
import { AgentService } from "./agent/service.ts";
import { loadAgentServicePolicy } from "./agent/servicePolicy.ts";
import { parseAgentPrivateTargets } from "./agent/providerTargetPolicy.ts";
import { AgentProviderOperations } from "./agent/providerOperations.ts";
import { ApiEventHub } from "./api/sync/events.ts";
import { ApiRevisionTracker } from "./api/sync/revisionTracker.ts";
import { ApiSearchService } from "./api/search.ts";
import { systemApiRuntime } from "./api/http/runtime.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryRoot =
  process.env.CTN_REPOSITORY_ROOT ??
  path.join(process.cwd(), ".cognition-tree", "repositories");
const repositoryHostRootValue = process.env.CTN_REPOSITORY_HOST_ROOT?.trim();
const repositoryHostRoot = repositoryHostRootValue ? repositoryHostRootValue : null;

if (repositoryHostRoot !== null && !path.isAbsolute(repositoryHostRoot)) {
  throw new Error("CTN_REPOSITORY_HOST_ROOT must be an absolute path");
}
const serverStateDirectory =
  process.env.CTN_SERVER_STATE_DIR ??
  path.join(process.cwd(), ".cognition-tree", "server");
const security = createApiSecurityPolicy({
  bearerToken: process.env.CTN_API_TOKEN,
  host,
  publicUrl: process.env.CTN_PUBLIC_URL,
});

const localCatalog = new LocalRepositoryCatalog(repositoryRoot, {
  hostRoot: repositoryHostRoot,
});
const catalog = localCatalog;
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
});
const agentStatus = await agentService.status();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
  await agentService.dispose();
  await catalog.dispose();
};

process.once("SIGINT", () => {
  void shutdown().catch((error: unknown) => {
    console.error("Failed to shut down Cognition Tree API", error);
    process.exitCode = 1;
  });
});
process.once("SIGTERM", () => {
  void shutdown().catch((error: unknown) => {
    console.error("Failed to shut down Cognition Tree API", error);
    process.exitCode = 1;
  });
});

server.listen(port, host, () => {
  console.log(`Cognition Tree API listening on http://${host}:${port}`);
  console.log(`Local repository root: ${localCatalog.rootPath}`);
  console.log(`Built-in data root: ${path.join(localCatalog.rootPath, ".built-ins")}`);
  console.log(`Server state: ${serverStateDirectory}`);
  console.log(`Allowed hosts: ${security.allowedHosts.join(", ")}`);
  console.log(`Allowed origins: ${security.allowedOrigins.join(", ") || "none"}`);
  console.log(
    `Bearer authentication: ${security.requiresBearerToken ? "required" : "disabled"}`,
  );
  console.log(
    `Agent profiles: ${agentStatus.enabled ? "available" : "unavailable"}`,
  );
});
