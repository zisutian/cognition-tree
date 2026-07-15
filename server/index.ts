// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createWorkspaceApiServer,
  parseWorkspaceApiAllowedOrigins,
} from "./workspaceApiServer.ts";
import { LocalRepositoryCatalog } from "./localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "./compositeRepositoryCatalog.ts";
import {
  createWebDavRepositoryRegistrations,
  parseWebDavRepositoryConfigs,
} from "./webDavRepositoryConfig.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryRoot =
  process.env.CTN_REPOSITORY_ROOT ??
  path.join(process.cwd(), ".cognition-tree", "repositories");
const allowedOrigins = parseWorkspaceApiAllowedOrigins(
  process.env.CTN_API_ALLOWED_ORIGINS,
);

const localCatalog = new LocalRepositoryCatalog(repositoryRoot);
const webDavRegistrations = createWebDavRepositoryRegistrations(
  parseWebDavRepositoryConfigs(process.env.CTN_WEBDAV_REPOSITORIES),
);
const catalog = new CompositeRepositoryCatalog(
  localCatalog,
  webDavRegistrations,
);

await catalog.initialize();

const server = createWorkspaceApiServer({ allowedOrigins, catalog });

server.listen(port, host, () => {
  console.log(`Cognition Tree API listening on http://${host}:${port}`);
  console.log(`Local repository root: ${catalog.localRootPath}`);
  console.log(`Configured WebDAV repositories: ${webDavRegistrations.length}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ") || "none"}`);
});
