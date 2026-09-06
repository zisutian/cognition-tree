import { buildApiOperationPath } from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  serializeJsonIteratively,
  parseContentRevision,
} from "../../../contracts/common/index.ts";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/index.ts";
import {
  parseTodoSnapshot,
  parseTodoSyncRequest,
  parseTodoSyncResult,
} from "../../../contracts/todo/index.ts";
import type {
  TodoRepository,
  TodoRepositoryBackend,
  TodoRepositoryProvider,
} from "../../../application/todo/index.ts";
import type {
  TodoContentDto,
  TodoRevisionDto,
} from "../../../contracts/todo/index.ts";

import {
  createVersionedLocalDraftRevision,
  createLocalFirstVersionedRepository,
} from "../../../application/persistence/index.ts";
import { mergeTodoContent } from "../../../application/todo/index.ts";

import { todoRepositoryPreparation } from "../repository/index.ts";
import type { VersionedRepositoryCache } from "../../../application/persistence/index.ts";
import {
  subscribeClientReconnect,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";
import { createHttpRepositoryCacheIdentity } from "./httpRepositoryIdentity.ts";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository.ts";

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
      parseSyncRequest: parseTodoSyncRequest,
      parseSyncResult: parseTodoSyncResult,
      parseRevision: parseContentRevision,
      parseSnapshot: parseTodoSnapshot,
      serializeSyncRequest: serializeJsonIteratively,
    },
    endpoint: buildApiOperationPath("getTodoSyncSnapshot"),
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
