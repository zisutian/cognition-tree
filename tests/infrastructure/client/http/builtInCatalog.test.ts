// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { BuiltInCatalogDto } from "../../../../contracts/built-ins/types";
import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../../contracts/journal/types";
import type {
  TodoContentDto,
  TodoRevisionDto,
} from "../../../../contracts/todo/types";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
} from "../../../../infrastructure/client/http/builtInCatalog";
import {
  createHttpJournalRepositoryBackend,
  createHttpJournalRepositoryProvider,
} from "../../../../infrastructure/client/http/journalRepository";
import {
  createHttpTodoRepositoryBackend,
} from "../../../../infrastructure/client/http/todoRepository";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryRemoteError,
} from "../../../../application/persistence/versionedRepository";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/versionedRepositoryCache";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  tamperJournalTestEntryCreation,
} from "../../../core/journal/journalTestFixture";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoTimestamp,
} from "../../../core/todo/todoTestFixture";

const journalRevisionA = `sha256:${"a".repeat(64)}` as JournalRevisionDto;
const journalRevisionB = `sha256:${"b".repeat(64)}` as JournalRevisionDto;
const todoRevisionA = `sha256:${"c".repeat(64)}` as TodoRevisionDto;
const todoRevisionB = `sha256:${"d".repeat(64)}` as TodoRevisionDto;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function serverCatalog(prefix = "/state"): BuiltInCatalogDto {
  return {
    issues: [],
    repositories: [
      {
        id: "journal",
        label: "日记",
        location: {
          serverPath: `${prefix}/built-ins/journal/content.json`,
          type: "server",
        },
        protected: true,
      },
      {
        id: "todo",
        label: "代办",
        location: {
          serverPath: `${prefix}/built-ins/todo/content.json`,
          type: "server",
        },
        protected: true,
      },
    ],
  };
}

function createCaches() {
  return {
    catalogCache: createMemoryBuiltInCatalogCache(),
    journalCache: createMemoryVersionedRepositoryCache<
      JournalContentDto,
      JournalRevisionDto,
      `draft:${string}`
    >(),
    todoCache: createMemoryVersionedRepositoryCache<
      TodoContentDto,
      TodoRevisionDto,
      `draft:${string}`
    >(),
  };
}

const offlineFetch: typeof fetch = async () => {
  throw new TypeError("offline");
};

describe("HTTP built-in catalog and data repositories", () => {
  it("uses independent Journal and Todo snapshot contracts", async () => {
    const calls: Array<{
      body: BodyInit | null | undefined;
      method: string;
      url: string;
    }> = [];
    const journalContent = createEmptyJournalContent();
    const todoContent = createEmptyTodoContent();
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url,
      });
      if (init?.method === "PUT") {
        return jsonResponse({
          revision: url.endsWith("/journal")
            ? journalRevisionB
            : todoRevisionB,
        });
      }
      return url.endsWith("/journal")
        ? jsonResponse({ content: journalContent, revision: journalRevisionA })
        : jsonResponse({ content: todoContent, revision: todoRevisionA });
    };
    const journal = createHttpJournalRepositoryBackend({
      baseUrl: "https://api.test/root",
      fetch,
    });
    const todo = createHttpTodoRepositoryBackend({
      baseUrl: "https://api.test/root",
      fetch,
    });

    await expect(journal.loadRemoteSnapshot()).resolves.toEqual({
      content: journalContent,
      revision: journalRevisionA,
    });
    await expect(journal.commitRemoteSnapshot({
      baseRevision: journalRevisionA,
      content: journalContent,
    })).resolves.toEqual({ revision: journalRevisionB });
    await expect(todo.loadRemoteSnapshot()).resolves.toEqual({
      content: todoContent,
      revision: todoRevisionA,
    });
    await expect(todo.commitRemoteSnapshot({
      baseRevision: todoRevisionA,
      content: todoContent,
    })).resolves.toEqual({ revision: todoRevisionB });
    expect(calls.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: "GET", url: "https://api.test/root/api/v1/sync/journal" },
      { method: "PUT", url: "https://api.test/root/api/v1/sync/journal" },
      { method: "GET", url: "https://api.test/root/api/v1/sync/todo" },
      { method: "PUT", url: "https://api.test/root/api/v1/sync/todo" },
    ]);
    expect(JSON.parse(String(calls[1]?.body))).toEqual({
      baseRevision: journalRevisionA,
      content: journalContent,
    });
    expect(JSON.parse(String(calls[3]?.body))).toEqual({
      baseRevision: todoRevisionA,
      content: todoContent,
    });
  });

  it("maps versioned HTTP conflicts and failures without Workspace errors", async () => {
    const conflict = createHttpJournalRepositoryBackend({
      baseUrl: "https://api.test",
      fetch: async () => jsonResponse({
        code: "resource_conflict",
        details: { currentRevision: journalRevisionB },
        message: "journal changed",
        requestId: "request-conflict",
      }, 409),
    });
    const unavailable = createHttpJournalRepositoryBackend({
      baseUrl: "https://api.test",
      fetch: async () => jsonResponse({
        code: "adapter_unavailable",
        message: "journal unavailable",
        requestId: "request-unavailable",
      }, 503),
    });

    await expect(conflict.commitRemoteSnapshot({
      baseRevision: journalRevisionA,
      content: createEmptyJournalContent(),
    })).rejects.toEqual(
      expect.objectContaining<Partial<VersionedRepositoryBackendConflictError>>({
        currentRevision: journalRevisionB,
      }),
    );
    await expect(unavailable.loadRemoteSnapshot()).rejects.toEqual(
      expect.objectContaining<Partial<VersionedRepositoryRemoteError>>({
        code: "adapter_unavailable",
        retryable: true,
      }),
    );
  });

  it("loads content-free descriptors and retries the selected domain", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method: string; url: string }> = [];
    const journalContent = createEmptyJournalContent();
    const caches = createCaches();
    const transport = {
      baseUrl: "https://api.test/root",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        calls.push({
          body: init?.body,
          method: init?.method ?? "GET",
          url,
        });
        if (url.endsWith("/retry")) return jsonResponse({ status: "ready" });
        if (url.endsWith("/sync/journal")) {
          return jsonResponse({ content: journalContent, revision: journalRevisionA });
        }
        return jsonResponse(serverCatalog());
      },
    };
    const catalog = createHttpBuiltInCatalog({
      ...transport,
      catalogCache: caches.catalogCache,
    });
    const journalRepositories = createHttpJournalRepositoryProvider({
      ...transport,
      repositoryCache: caches.journalCache,
    });
    const projection = await catalog.listBuiltIns();
    const descriptor = projection.repositories[0]!;
    const repository = journalRepositories.openJournal(descriptor);

    expect(journalRepositories.openJournal(descriptor)).toBe(repository);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: journalRevisionA,
    });
    await expect(catalog.retry("journal")).resolves.toEqual({ status: "ready" });
    expect(calls.at(-1)).toEqual({
      body: undefined,
      method: "POST",
      url: "https://api.test/root/api/v1/admin/built-ins/journal/retry",
    });
    expect(calls[0]?.url).toBe("https://api.test/root/api/v1/admin/built-ins");
  });

  it("leaves Journal and Todo transition authority outside the HTTP backend", async () => {
    const journalContent = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const journalFetch = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? jsonResponse({ revision: journalRevisionB })
        : jsonResponse({ content: journalContent, revision: journalRevisionA })
    );
    const journal = createHttpJournalRepositoryBackend({
      baseUrl: "https://api.test",
      fetch: journalFetch,
    });

    await journal.loadRemoteSnapshot();
    await expect(journal.commitRemoteSnapshot({
      baseRevision: journalRevisionA,
      content: tamperJournalTestEntryCreation(journalContent, {
        createdAt: "2026-07-19T00:00:01.000Z",
        entryIndex: 1,
        timezoneOffsetMinutes: 480,
      }),
    })).resolves.toEqual({ revision: journalRevisionB });
    expect(journalFetch).toHaveBeenCalledTimes(2);

    const todoContent = appendTodoTestItem(
      appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
      }),
      {
        collectionIndex: 1,
        createdAt: todoTimestamp(2),
        itemIndex: 1,
      },
    );
    const todoFetch = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? jsonResponse({ revision: todoRevisionB })
        : jsonResponse({ content: todoContent, revision: todoRevisionA })
    );
    const todo = createHttpTodoRepositoryBackend({
      baseUrl: "https://api.test",
      fetch: todoFetch,
    });
    const invalidTodo = {
      ...todoContent,
      collections: [{
        ...todoContent.collections[0]!,
        source: todoContent.collections[0]!.source.replace(
          `id=${todoBlockId(1)} created=${todoTimestamp(2)}`,
          `id=${todoBlockId(1)} created=${todoTimestamp(3)}`,
        ),
      }],
    };

    await todo.loadRemoteSnapshot();
    await expect(todo.commitRemoteSnapshot({
      baseRevision: todoRevisionA,
      content: invalidTodo,
    })).resolves.toEqual({ revision: todoRevisionB });
    expect(todoFetch).toHaveBeenCalledTimes(2);
  });

  it("restores catalog and domain snapshots from an isolated local-first cache", async () => {
    const caches = createCaches();
    const journalContent = createEmptyJournalContent();
    const transport = {
      baseUrl: "https://cached.test/api",
      fetch: async (input: RequestInfo | URL) =>
        String(input).endsWith("/sync/journal")
        ? jsonResponse({ content: journalContent, revision: journalRevisionA })
        : jsonResponse(serverCatalog("/cached")),
      token: "same-token",
    };
    const online = createHttpBuiltInCatalog({
      ...transport,
      catalogCache: caches.catalogCache,
    });
    const onlineJournals = createHttpJournalRepositoryProvider({
      ...transport,
      repositoryCache: caches.journalCache,
    });
    const projection = await online.listBuiltIns();

    await onlineJournals.openJournal(projection.repositories[0]!).loadSnapshot();
    const offline = createHttpBuiltInCatalog({
      baseUrl: "https://cached.test/api",
      catalogCache: caches.catalogCache,
      fetch: offlineFetch,
      token: "same-token",
    });
    const offlineJournals = createHttpJournalRepositoryProvider({
      baseUrl: "https://cached.test/api",
      fetch: offlineFetch,
      repositoryCache: caches.journalCache,
      token: "same-token",
    });
    const cachedProjection = await offline.listBuiltIns();

    expect(cachedProjection).toEqual(projection);
    await expect(
      offlineJournals.openJournal(cachedProjection.repositories[0]!).loadSnapshot(),
    ).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: journalRevisionA,
    });
    await expect(createHttpBuiltInCatalog({
      baseUrl: "https://cached.test/api",
      catalogCache: caches.catalogCache,
      fetch: offlineFetch,
      token: "different-token",
    }).listBuiltIns()).rejects.toThrow("failed or timed out");
  });
});
