// SPDX-License-Identifier: GPL-3.0-or-later

import { rm } from "node:fs/promises";
import path from "node:path";
import {
  createWorkspaceApiServer,
} from "../../server/api/workspaceApiServer.ts";
import {
  createWorkspaceApiSecurityPolicy,
} from "../../server/api/workspaceApiSecurity.ts";
import { LocalRepositoryCatalog } from "../../server/adapters/local/localRepositoryCatalog.ts";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3317");
const repositoryDir = path.resolve(
  process.env.CTN_E2E_REPOSITORY_DIR ??
    path.join(".cognition-tree", "e2e-repository"),
);
const security = {
  ...createWorkspaceApiSecurityPolicy({ host }),
  allowedOrigins: [
    process.env.CTN_E2E_WEB_ORIGIN ?? "http://127.0.0.1:4174",
  ],
};

await rm(repositoryDir, { force: true, recursive: true });

const catalog = new LocalRepositoryCatalog(repositoryDir);

await catalog.initialize();

const server = createWorkspaceApiServer({ catalog, security });

server.listen(port, host, () => {
  console.log(`Cognition Tree E2E API listening on http://${host}:${port}`);
});

async function closeServer() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await catalog.dispose();
}

process.once("SIGINT", () => void closeServer());
process.once("SIGTERM", () => void closeServer());
