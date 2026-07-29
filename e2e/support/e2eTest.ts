// SPDX-License-Identifier: GPL-3.0-or-later

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
import { e2eApiBaseUrl } from "./repositorySeeds";

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
  e2eState: E2EState;
};

export const test = base.extend<E2EFixtures>({
  api: async ({}, use) => {
    const api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });

    await use(api);
    await api.dispose();
  },
  e2eState: [async ({ api }, use) => {
    const response = await api.post("/__e2e/reset");

    if (!response.ok()) {
      throw new Error(
        `Failed to reset E2E state: ${response.status()} ${
          await response.text()
        }`,
      );
    }
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
