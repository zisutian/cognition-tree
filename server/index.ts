// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createWorkspaceApiServer,
} from "./api/workspaceApiServer.ts";
import {
  createWorkspaceApiSecurityPolicy,
  parseWorkspaceApiAllowedHosts,
  parseWorkspaceApiAllowedOrigins,
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
const allowedOrigins = parseWorkspaceApiAllowedOrigins(
  process.env.CTN_API_ALLOWED_ORIGINS,
);
const security = createWorkspaceApiSecurityPolicy({
  allowedHosts: parseWorkspaceApiAllowedHosts(
    process.env.CTN_API_ALLOWED_HOSTS,
  ),
  allowedOrigins,
  bearerToken: process.env.CTN_API_TOKEN,
  host,
});

const localCatalog = new LocalRepositoryCatalog(repositoryRoot);
const webDavRegistrations = createWebDavRepositoryRegistrations(
  parseWebDavRepositoryConfigs(process.env.CTN_WEBDAV_REPOSITORIES),
);
const catalog = new CompositeRepositoryCatalog(
  localCatalog,
  webDavRegistrations,
);

await catalog.initialize();

const server = createWorkspaceApiServer({ catalog, security });

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
