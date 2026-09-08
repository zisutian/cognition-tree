// SPDX-License-Identifier: GPL-3.0-or-later

import { type VersionedRepositoryCache,createLocalFirstVersionedRepository,createVersionedLocalDraftRevision } from "../../../application/persistence/index.ts";
import { type TodoRepository,type TodoRepositoryProvider,mergeTodoContent,todoRepositoryPreparation } from "../../../application/todo/index.ts";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/index.ts";
import type { TodoContentDto,TodoRevisionDto } from "../../../contracts/todo/index.ts";
import { type HttpApiTransportOptions,createHttpRepositoryCacheIdentity,createHttpTodoRepositoryBackend,subscribeClientReconnect } from "../http/index.ts";
import { createClientUuid } from "../platform/index.ts";

type TodoRepositoryCache = VersionedRepositoryCache<TodoContentDto, TodoRevisionDto, `draft:${string}`>;

export function createHttpTodoRepositoryProvider({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryCache,
}: HttpApiTransportOptions & {
  repositoryCache: TodoRepositoryCache;
}): TodoRepositoryProvider {
  let repository: TodoRepository | null = null;

  return {
    openTodo(value) {
      const descriptor = parseBuiltInDescriptor(value);

      if (descriptor.id !== "todo") {
        throw new Error("HTTP Todo descriptor is invalid");
      }
      repository ??= createLocalFirstVersionedRepository({
        backend: createHttpTodoRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
        }),
        cache: repositoryCache,
        createLocalRevision: () =>
          createVersionedLocalDraftRevision<`draft:${string}`>(
            createClientUuid,
          ),
        label: descriptor.label,
        loadPolicy: { mode: "refresh-remote" },
        location: descriptor.location,
        mergeContent: mergeTodoContent,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: "built-in:todo",
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation: todoRepositoryPreparation,
      });
      return repository;
    },
  };
}
