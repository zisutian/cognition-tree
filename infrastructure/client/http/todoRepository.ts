// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../../../contracts/common/json";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/parseBuiltIns";
import {
  parseTodoCommit,
  parseTodoCommitResult,
  parseTodoSnapshot,
} from "../../../contracts/todo/parseTodo";
import type {
  TodoRepository,
  TodoRepositoryBackend,
  TodoRepositoryProvider,
} from "../../../application/todo/persistence/todoRepository";
import type {
  TodoContentDto,
  TodoRevisionDto,
} from "../../../contracts/todo/types";
import { parseContentRevision } from "../../../contracts/common/contractValue";
import { createVersionedLocalDraftRevision } from "../../../application/persistence/versionedRepository";
import { mergeTodoContent } from "../../../application/todo/persistence/todoThreeWayMerge";
import { createLocalFirstVersionedRepository } from "../repository/resilientVersionedRepository";
import { todoRepositoryPreparation } from "../repository/todoRepositoryCodec";
import type { VersionedRepositoryCache } from "../repository/versionedRepositoryCache";
import {
  subscribeClientReconnect,
  type HttpApiTransportOptions,
} from "./apiTransport";
import { createHttpRepositoryCacheIdentity } from "./httpRepositoryIdentity";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository";

type TodoRepositoryCache = VersionedRepositoryCache<
  TodoContentDto,
  TodoRevisionDto,
  `draft:${string}`
>;

export function createHttpTodoRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): TodoRepositoryBackend {
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseCommit: parseTodoCommit,
      parseCommitResult: parseTodoCommitResult,
      parseRevision: parseContentRevision,
      parseSnapshot: parseTodoSnapshot,
      serializeCommit: serializeJsonIteratively,
    },
    endpoint: "/api/v2/sync/todo",
    fetch: fetchFn,
    token,
  });
}

export function createHttpTodoRepositoryProvider({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryCache,
  token,
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
          token,
        }),
        cache: repositoryCache,
        createLocalRevision: () =>
          createVersionedLocalDraftRevision<`draft:${string}`>(
            () => globalThis.crypto.randomUUID(),
          ),
        label: descriptor.label,
        loadPolicy: { mode: "refresh-remote" },
        location: descriptor.location,
        mergeContent: mergeTodoContent,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: "built-in:todo",
          token,
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation: todoRepositoryPreparation,
      });
      return repository;
    },
  };
}
