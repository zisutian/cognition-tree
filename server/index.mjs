// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { createWorkspaceApiServer, WorkspaceFileStore } from "./workspaceApiServer.mjs";

const host = process.env.CTN_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CTN_API_PORT ?? "3001");
const repositoryDir =
  process.env.CTN_REPOSITORY_DIR ??
  path.join(process.cwd(), ".cognition-tree", "repository");

const store = new WorkspaceFileStore(repositoryDir);

await store.initialize();

const server = createWorkspaceApiServer({ store });

server.listen(port, host, () => {
  console.log(`Cognition Tree API listening on http://${host}:${port}`);
  console.log(`Repository: ${store.repositoryPath}`);
});

