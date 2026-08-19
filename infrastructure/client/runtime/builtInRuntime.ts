// SPDX-License-Identifier: GPL-3.0-or-later

import type { ClientApiConfiguration } from "./apiConfiguration";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
} from "../http/builtInCatalog";
import type { BuiltInCatalog } from "../../../application/repository/builtInCatalog";
import type { JournalRepositoryProvider } from "../../../application/journal/persistence/journalRepository";
import type { TodoRepositoryProvider } from "../../../application/todo/persistence/todoRepository";
import { createHttpJournalRepositoryProvider } from "../http/journalRepository";
import { createHttpTodoRepositoryProvider } from "../http/todoRepository";
import { createMemoryVersionedRepositoryCache } from "../repository/versionedRepositoryCache";

export type BuiltInRuntime = {
  catalog: BuiltInCatalog;
  journalRepositories: JournalRepositoryProvider;
  todoRepositories: TodoRepositoryProvider;
};

export function createBuiltInRuntime(
  api: ClientApiConfiguration,
): BuiltInRuntime {
  const fetchOptions = {
    baseUrl: api.baseUrl,
    token: api.token,
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
