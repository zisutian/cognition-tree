// SPDX-License-Identifier: GPL-3.0-or-later

import type { OfficialClientApi } from "../http/index.ts";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
  createHttpJournalRepositoryProvider,
  createHttpTodoRepositoryProvider,
} from "../http/index.ts";
import type { BuiltInCatalog } from "../../../application/repository/index.ts";
import type { JournalRepositoryProvider } from "../../../application/journal/index.ts";
import type { TodoRepositoryProvider } from "../../../application/todo/index.ts";


import { createMemoryVersionedRepositoryCache } from "../repository/index.ts";

export type BuiltInRuntime = {
  catalog: BuiltInCatalog;
  journalRepositories: JournalRepositoryProvider;
  todoRepositories: TodoRepositoryProvider;
};

export function createBuiltInRuntime(
  api: OfficialClientApi,
): BuiltInRuntime {
  const fetchOptions = {
    baseUrl: api.baseUrl,
  };

  return {
    catalog: createHttpBuiltInCatalog({
      ...fetchOptions,
      catalogCache: createMemoryBuiltInCatalogCache(),
    }),
    journalRepositories: createHttpJournalRepositoryProvider({
      ...fetchOptions,
      repositoryCache: createMemoryVersionedRepositoryCache(),
    }),
    todoRepositories: createHttpTodoRepositoryProvider({
      ...fetchOptions,
      repositoryCache: createMemoryVersionedRepositoryCache(),
    }),
  };
}
