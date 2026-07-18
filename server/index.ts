// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createWorkspaceApiServer,
} from "./api/workspaceApiServer.ts";
import {
  createWorkspaceApiSecurityPolicy,
} from "./api/workspaceApiSecurity.ts";
import { LocalRepositoryCatalog } from "./adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "./catalog/compositeRepositoryCatalog.ts";
import { WebDavConnectionRegistry } from "./adapters/webdav/webDavConnectionRegistry.ts";
import { parseWebDavPrivateTargets } from "./adapters/webdav/webDavTargetPolicy.ts";
import { SystemRepositoryCatalog } from "./repository/systemRepositoryCatalog.ts";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "./repository/systemRepositoryStore.ts";

if (process.env.CTN_WEBDAV_REPOSITORIES !== undefined) {
  throw new Error(
    "CTN_WEBDAV_REPOSITORIES is unsupported; manage WebDAV connections in Settings",
  );
}

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
const security = createWorkspaceApiSecurityPolicy({
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
const systemCatalog = new SystemRepositoryCatalog(serverStateDirectory, {
  validateContent: validateSystemRepositoryContent,
  validateTransition: validateSystemRepositoryTransition,
});

await catalog.initialize();
await systemCatalog.initialize();

const server = createWorkspaceApiServer({ catalog, security, systemCatalog });

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
  console.log(`WebDAV server state: ${serverStateDirectory}`);
  console.log(`Allowed hosts: ${security.allowedHosts.join(", ")}`);
  console.log(`Allowed origins: ${security.allowedOrigins.join(", ") || "none"}`);
  console.log(
    `Bearer authentication: ${security.requiresBearerToken ? "required" : "disabled"}`,
  );
});
