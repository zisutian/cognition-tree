// SPDX-License-Identifier: GPL-3.0-or-later

import { rm } from "node:fs/promises";
import path from "node:path";
import {
  createWorkspaceApiServer,
  parseWorkspaceApiAllowedOrigins,
} from "../../server/workspaceApiServer.ts";
import { LocalRepositoryCatalog } from "../../server/localRepositoryCatalog.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3317");
const repositoryDir = path.resolve(
  process.env.CTN_E2E_REPOSITORY_DIR ??
    path.join(".cognition-tree", "e2e-repository"),
);
const allowedOrigins = parseWorkspaceApiAllowedOrigins(
  process.env.CTN_API_ALLOWED_ORIGINS,
);

await rm(repositoryDir, { force: true, recursive: true });

const catalog = new LocalRepositoryCatalog(repositoryDir);

await catalog.initialize();

const server = createWorkspaceApiServer({ allowedOrigins, catalog });

server.listen(port, host, () => {
  console.log(`Cognition Tree E2E API listening on http://${host}:${port}`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);
