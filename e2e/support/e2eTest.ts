// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  request as createRequest,
  test as base,
  type APIRequestContext,
} from "@playwright/test";
import type { JournalContentDto } from "../../contracts/journal/types";
import type { TodoContentDto } from "../../contracts/todo/types";
import {
  resetJournalRepository,
  resetTodoRepository,
} from "./builtInSeeds";
import {
  startE2EWorkspaceServer,
  type E2EWorkspaceServer,
} from "./workspaceServer";

type E2EState = {
  setBuiltIns(input: {
    journal: JournalContentDto;
    todo: TodoContentDto;
  }): Promise<void>;
  setJournal(content: JournalContentDto): Promise<void>;
  setTodo(content: TodoContentDto): Promise<void>;
};

type E2EFixtures = {
  api: APIRequestContext;
  apiBaseUrl: string;
  baseURL: string;
  e2eState: E2EState;
  repositoryRoot: string;
};

type E2EWorkerFixtures = {
  e2eServer: E2EWorkspaceServer;
};

export const test = base.extend<E2EFixtures, E2EWorkerFixtures>({
  e2eServer: [async ({}, use) => {
    const rootDirectory = await mkdtemp(
      path.join(os.tmpdir(), "cognition-tree-e2e-"),
    );
    const server = await startE2EWorkspaceServer({
      rootDirectory,
    });

    try {
      await use(server);
    } finally {
      await server.close();
      await rm(rootDirectory, { force: true, recursive: true });
    }
  }, { scope: "worker" }],
  apiBaseUrl: async ({ e2eServer }, use) => {
    await use(e2eServer.baseUrl);
  },
  baseURL: async ({ e2eServer }, use) => {
    await use(e2eServer.baseUrl);
  },
  repositoryRoot: async ({ e2eServer }, use) => {
    await use(e2eServer.repositoryDirectory);
  },
  api: async ({ e2eServer }, use) => {
    const api = await createRequest.newContext({
      baseURL: e2eServer.baseUrl,
    });

    await use(api);
    await api.dispose();
  },
  e2eState: [async ({ api, e2eServer }, use) => {
    await e2eServer.reset();
    await use({
      async setBuiltIns({ journal, todo }) {
        await Promise.all([
          resetJournalRepository(api, journal),
          resetTodoRepository(api, todo),
        ]);
      },
      setJournal: (content) => resetJournalRepository(api, content),
      setTodo: (content) => resetTodoRepository(api, content),
    });
  }, { auto: true }],
});
