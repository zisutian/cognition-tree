// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import {
  createWorkspaceApiServer,
  parseWorkspaceApiAllowedOrigins,
} from "./workspaceApiServer.ts";
import { LocalRepositoryCatalog } from "./localRepositoryCatalog.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryRoot =
  process.env.CTN_REPOSITORY_ROOT ??
  path.join(process.cwd(), ".cognition-tree", "repositories");
const allowedOrigins = parseWorkspaceApiAllowedOrigins(
  process.env.CTN_API_ALLOWED_ORIGINS,
);

const catalog = new LocalRepositoryCatalog(repositoryRoot);

await catalog.initialize();

const server = createWorkspaceApiServer({ allowedOrigins, catalog });

server.listen(port, host, () => {
  console.log(`Cognition Tree API listening on http://${host}:${port}`);
  console.log(`Repository root: ${catalog.rootPath}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ") || "none"}`);
});
