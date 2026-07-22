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
} from "../../../../infrastructure/http/httpBuiltInCatalog";
import { createHttpJournalRepositoryBackend } from "../../../../infrastructure/http/httpJournalRepository";
import { createHttpTodoRepositoryBackend } from "../../../../infrastructure/http/httpTodoRepository";
import { journalRepositoryCodec } from "../../../../infrastructure/persistence/journalRepository";
import { todoRepositoryCodec } from "../../../../infrastructure/persistence/todoRepository";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/persistence/versionedRepositoryCache";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  tamperJournalTestEntryCreation,
} from "../../../journal/journalTestFixture";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoTimestamp,
} from "../../../todo/todoTestFixture";

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
    >({
      codec: journalRepositoryCodec,
    }),
    todoCache: createMemoryVersionedRepositoryCache<
      TodoContentDto,
      TodoRevisionDto,
      `draft:${string}`
    >({
      codec: todoRepositoryCodec,
    }),
  };
}

const offlineFetch: typeof fetch = async () => {
  throw new TypeError("offline");
};

describe("HTTP built-in data repositories", () => {
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
          revision: url.includes("/journal/")
            ? journalRevisionB
            : todoRevisionB,
        });
      }
      return url.includes("/journal/")
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
      { method: "GET", url: "https://api.test/root/api/journal/snapshot" },
      { method: "PUT", url: "https://api.test/root/api/journal/snapshot" },
      { method: "GET", url: "https://api.test/root/api/todo/snapshot" },
      { method: "PUT", url: "https://api.test/root/api/todo/snapshot" },
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

  it("loads content-free descriptors and retries the selected domain", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method: string; url: string }> = [];
    const journalContent = createEmptyJournalContent();
    const catalog = createHttpBuiltInCatalog({
      baseUrl: "https://api.test/root",
      ...createCaches(),
      fetch: async (input, init) => {
        const url = String(input);

        calls.push({
          body: init?.body,
          method: init?.method ?? "GET",
          url,
        });
        if (url.endsWith("/retry")) return jsonResponse({ status: "ready" });
        if (url.endsWith("/snapshot")) {
          return jsonResponse({ content: journalContent, revision: journalRevisionA });
        }
        return jsonResponse(serverCatalog());
      },
    });
    const projection = await catalog.listBuiltIns();
    const descriptor = projection.repositories[0]!;
    const repository = catalog.openJournal(descriptor);

    expect(catalog.openJournal(descriptor)).toBe(repository);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: journalRevisionA,
    });
    await expect(catalog.retry("journal")).resolves.toEqual({ status: "ready" });
    expect(calls.at(-1)).toEqual({
      body: undefined,
      method: "POST",
      url: "https://api.test/root/api/journal/retry",
    });
    expect(calls[0]?.url).toBe("https://api.test/root/api/built-ins");
  });

  it("rejects invalid Journal and Todo transitions before issuing PUT", async () => {
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
    })).rejects.toThrow(/createdAt is immutable/);
    expect(journalFetch).toHaveBeenCalledTimes(1);

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
    })).rejects.toThrow(/createdAt is immutable/);
    expect(todoFetch).toHaveBeenCalledTimes(1);
  });

  it("restores catalog and domain snapshots from an isolated local-first cache", async () => {
    const caches = createCaches();
    const journalContent = createEmptyJournalContent();
    const online = createHttpBuiltInCatalog({
      baseUrl: "https://cached.test/api",
      ...caches,
      fetch: async (input) => String(input).endsWith("/snapshot")
        ? jsonResponse({ content: journalContent, revision: journalRevisionA })
        : jsonResponse(serverCatalog("/cached")),
      token: "same-token",
    });
    const projection = await online.listBuiltIns();

    await online.openJournal(projection.repositories[0]!).loadSnapshot();
    const offline = createHttpBuiltInCatalog({
      baseUrl: "https://cached.test/api",
      ...caches,
      fetch: offlineFetch,
      token: "same-token",
    });
    const cachedProjection = await offline.listBuiltIns();

    expect(cachedProjection).toEqual(projection);
    await expect(
      offline.openJournal(cachedProjection.repositories[0]!).loadSnapshot(),
    ).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: journalRevisionA,
    });
    await expect(createHttpBuiltInCatalog({
      baseUrl: "https://cached.test/api",
      ...caches,
      fetch: offlineFetch,
      token: "different-token",
    }).listBuiltIns()).rejects.toThrow("failed or timed out");
  });
});
