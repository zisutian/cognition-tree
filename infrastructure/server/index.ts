// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createApiServer,
} from "./api/http/server.ts";
import {
  createApiSecurityPolicy,
} from "./api/http/security.ts";
import { LocalRepositoryCatalog } from "./adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "./catalog/compositeRepositoryCatalog.ts";
import { WebDavConnectionRegistry } from "./adapters/webdav/webDavConnectionRegistry.ts";
import { parseWebDavPrivateTargets } from "./adapters/webdav/webDavTargetPolicy.ts";
import { BuiltInCatalog } from "./repository/built-ins/catalog.ts";
import { AutomationTokenStore } from "./access/automationTokenStore.ts";
import { AgentOperationLedger } from "./agent/operationLedger.ts";
import { loadAgentProfileCatalog } from "./agent/profiles.ts";
import { AgentService } from "./agent/service.ts";
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
const webDavRegistry = new WebDavConnectionRegistry({
  privateTargetPolicy: parseWebDavPrivateTargets(
    process.env.CTN_WEBDAV_PRIVATE_TARGETS,
  ),
  stateDirectory: serverStateDirectory,
});
const catalog = new CompositeRepositoryCatalog(
  localCatalog,
  webDavRegistry,
);
const builtInCatalog = new BuiltInCatalog(repositoryRoot);

await catalog.initialize();
await builtInCatalog.initialize();

const accessStore = new AutomationTokenStore(serverStateDirectory);
const profileCatalog = await loadAgentProfileCatalog(
  process.env.CTN_AGENT_PROFILES_FILE,
);
const operationLedger = profileCatalog.maxAuditEntries === null
  ? null
  : new AgentOperationLedger(
      serverStateDirectory,
      profileCatalog.maxAuditEntries,
    );
const eventHub = new ApiEventHub();
const revisionTracker = new ApiRevisionTracker();
const search = new ApiSearchService({ builtInCatalog, catalog });
const agentService = new AgentService({
  builtInCatalog,
  catalog,
  eventHub,
  ledger: operationLedger,
  profileCatalog,
  revisionTracker,
  runtime: systemApiRuntime,
  search,
});

const server = createApiServer({
  accessStore,
  agentService,
  builtInCatalog,
  catalog,
  eventHub,
  operationLedger,
  revisionTracker,
  security,
  stateDirectory: serverStateDirectory,
});

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
  console.log(`WebDAV server state: ${serverStateDirectory}`);
  console.log(`Allowed hosts: ${security.allowedHosts.join(", ")}`);
  console.log(`Allowed origins: ${security.allowedOrigins.join(", ") || "none"}`);
  console.log(
    `Bearer authentication: ${security.requiresBearerToken ? "required" : "disabled"}`,
  );
  console.log(
    `Agent profiles: ${agentService.status().enabled ? "available" : "unavailable"}`,
  );
});
