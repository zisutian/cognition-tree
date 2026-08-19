// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseBuiltInCatalog,
  parseBuiltInDescriptor,
  parseBuiltInId,
  parseBuiltInRetryResult,
} from "../../../contracts/built-ins/parseBuiltIns";
import type { JournalContentDto, JournalRevisionDto } from "../../../contracts/journal/types";
import type { TodoContentDto, TodoRevisionDto } from "../../../contracts/todo/types";
import { createLocalFirstVersionedRepository } from "../repository/resilientVersionedRepository";
import {
  type BuiltInCatalog,
  type JournalRepository,
  type TodoRepository,
} from "../../../application/repository/builtInRepository";
import {
  journalRepositoryPreparation,
} from "../repository/journalRepositoryCodec";
import {
  todoRepositoryPreparation,
} from "../repository/todoRepositoryCodec";
import {
  createVersionedLocalDraftRevision,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "../../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "../repository/versionedRepositoryCache";
import type { BuiltInCatalogCache } from "../repository/builtInCatalogCache";
import { createHttpJournalRepositoryBackend } from "./journalRepository";
import {
  createHttpRepositoryCacheIdentity,
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./repositoryTransport";
import { createHttpTodoRepositoryBackend } from "./todoRepository";
import {
  mergeJournalContent,
  mergePreparedJournalContent,
  mergePreparedTodoContent,
  mergeTodoContent,
} from "../../../application/sync/domainThreeWayMerge";

type JournalCache = VersionedRepositoryCache<
  JournalContentDto,
  JournalRevisionDto,
  `draft:${string}`
>;
type TodoCache = VersionedRepositoryCache<
  TodoContentDto,
  TodoRevisionDto,
  `draft:${string}`
>;

export function createMemoryBuiltInCatalogCache(): BuiltInCatalogCache {
  const values = new Map<string, ReturnType<typeof parseBuiltInCatalog>>();

  return {
    async load(identity) {
      const value = values.get(identity);

      return value ? structuredClone(value) : null;
    },
    async save(identity, catalog) {
      values.set(identity, structuredClone(parseBuiltInCatalog(catalog)));
    },
  };
}

function isOfflineError(error: unknown) {
  return error instanceof VersionedRepositoryUnavailableError ||
    (error instanceof VersionedRepositoryRemoteError && error.retryable);
}

function subscribeClientReconnect(listener: () => void) {
  if (typeof globalThis.addEventListener !== "function") return () => undefined;
  globalThis.addEventListener("online", listener);
  return () => globalThis.removeEventListener("online", listener);
}

export function createHttpBuiltInCatalog({
  baseUrl,
  catalogCache,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  journalCache,
  todoCache,
  token,
}: HttpRepositoryTransportOptions & {
  catalogCache: BuiltInCatalogCache;
  journalCache: JournalCache;
  todoCache: TodoCache;
}): BuiltInCatalog {
  let journalRepository: JournalRepository | null = null;
  let todoRepository: TodoRepository | null = null;
  const catalogIdentity = createHttpRepositoryCacheIdentity({
    baseUrl,
    repositoryId: "__built-ins__",
    token,
  });
  const createLocalRevision = () =>
    createVersionedLocalDraftRevision<`draft:${string}`>(
      () => globalThis.crypto.randomUUID(),
    );

  return {
    label: "HTTP 内置数据",
    async listBuiltIns() {
      try {
        const catalog = parseBuiltInCatalog(
          await requestRepositoryJson(
            fetchFn,
            baseUrl,
            "/api/v1/admin/built-ins",
            undefined,
            token,
          ),
        );

        await catalogCache.save(await catalogIdentity, catalog).catch(() => undefined);
        return catalog;
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        const cached = await catalogCache.load(await catalogIdentity).catch(() => null);

        if (!cached) throw error;
        return cached;
      }
    },
    openJournal(value) {
      const descriptor = parseBuiltInDescriptor(value);
      if (descriptor.id !== "journal") {
        throw new Error("HTTP Journal descriptor is invalid");
      }
      journalRepository ??= createLocalFirstVersionedRepository({
        backend: createHttpJournalRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
          token,
        }),
        cache: journalCache,
        createLocalRevision,
        label: descriptor.label,
        location: descriptor.location,
        mergeContent: mergeJournalContent,
        mergePreparedContent: mergePreparedJournalContent,
        refreshRemoteOnLoad: true,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: "built-in:journal",
          token,
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation: journalRepositoryPreparation,
      });
      return journalRepository;
    },
    openTodo(value) {
      const descriptor = parseBuiltInDescriptor(value);
      if (descriptor.id !== "todo") {
        throw new Error("HTTP Todo descriptor is invalid");
      }
      todoRepository ??= createLocalFirstVersionedRepository({
        backend: createHttpTodoRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
          token,
        }),
        cache: todoCache,
        createLocalRevision,
        label: descriptor.label,
        location: descriptor.location,
        mergeContent: mergeTodoContent,
        mergePreparedContent: mergePreparedTodoContent,
        refreshRemoteOnLoad: true,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: "built-in:todo",
          token,
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation: todoRepositoryPreparation,
      });
      return todoRepository;
    },
    async retry(value) {
      const id = parseBuiltInId(value);

      return parseBuiltInRetryResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/v1/admin/built-ins/${id}/retry`,
          { method: "POST" },
          token,
        ),
      );
    },
  };
}
