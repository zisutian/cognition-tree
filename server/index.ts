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
import {
  createWebDavRepositoryRegistrations,
  parseWebDavRepositoryConfigs,
} from "./adapters/webdav/webDavRepositoryConfig.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryRoot =
  process.env.CTN_REPOSITORY_ROOT ??
  path.join(process.cwd(), ".cognition-tree", "repositories");
const security = createWorkspaceApiSecurityPolicy({
  bearerToken: process.env.CTN_API_TOKEN,
  host,
  publicUrl: process.env.CTN_PUBLIC_URL,
});

const localCatalog = new LocalRepositoryCatalog(repositoryRoot);
const webDavRegistrations = await createWebDavRepositoryRegistrations(
  parseWebDavRepositoryConfigs(process.env.CTN_WEBDAV_REPOSITORIES),
);
const catalog = new CompositeRepositoryCatalog(
  localCatalog,
  webDavRegistrations,
);

await catalog.initialize();

const server = createWorkspaceApiServer({ catalog, security });

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
  await localCatalog.dispose();
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
  console.log(`Configured WebDAV repositories: ${webDavRegistrations.length}`);
  console.log(`Allowed hosts: ${security.allowedHosts.join(", ")}`);
  console.log(`Allowed origins: ${security.allowedOrigins.join(", ") || "none"}`);
  console.log(
    `Bearer authentication: ${security.requiresBearerToken ? "required" : "disabled"}`,
  );
});
