// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import { parseWorkspaceRepositorySnapshot } from "../../../contracts/workspace/parseRepository";
import type {
  RepositoryApiErrorDto,
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
  RepositoryDeletionResultDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types";
import { LocalRepositoryCatalog } from "../../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import {
  createWorkspaceApiRequestHandler,
  type WorkspaceApiRequestHandler,
} from "../../../infrastructure/server/api/workspaceApiServer.ts";
import { createWorkspaceApiSecurityPolicy } from "../../../infrastructure/server/api/workspaceApiSecurity.ts";
import { CompositeRepositoryCatalog } from "../../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";
import { BuiltInCatalog } from "../../../infrastructure/server/repository/builtInCatalog.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../../../infrastructure/server/repository/repositoryCatalog.ts";
import {
  createDeepWorkspaceRepositoryContent,
} from "../../support/workspaceRepositoryFixtures";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  tamperJournalTestEntryCreation,
} from "../../journal/journalTestFixture";
import {
  setTodoBlockRecurrence,
} from "../../../core/todo/commands/todoCommands";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../todo/todoTestFixture";

function createContent(name = "本地笔记库"): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: { id: "workspace", name, notes: [], tree: [] },
  };
}

type RequestOptions = {
  body?: string;
  headers?: IncomingHttpHeaders;
  method: string;
  url: string;
};

type TestServerResponse = {
  body: string;
  headers: Record<string, OutgoingHttpHeader>;
  statusCode: number;
  setHeader: (name: string, value: OutgoingHttpHeader) => void;
  writeHead: (statusCode: number, headers: OutgoingHttpHeaders) => void;
  end: (chunk?: string | Buffer) => void;
};

function createRequest({ body = "", headers = {}, method, url }: RequestOptions) {
  return Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
    headers: { host: "127.0.0.1:3001", ...headers },
    method,
    url,
  }) as IncomingMessage;
}

function createResponse(): TestServerResponse {
  return {
    body: "",
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      Object.entries(headers).forEach(([name, value]) => {
        if (value !== undefined) {
          this.setHeader(name, value);
        }
      });
    },
    end(chunk = "") {
      this.body += chunk.toString();
    },
  };
}

async function dispatch<Body = Record<string, unknown>>(
  handler: WorkspaceApiRequestHandler,
  requestOptions: RequestOptions,
) {
  const response = createResponse();

  await handler(createRequest(requestOptions), response as unknown as ServerResponse);
  return {
    body: response.body ? JSON.parse(response.body) as Body : null,
    headers: response.headers,
    statusCode: response.statusCode,
  };
}

async function withHandler<Result>(
  run: (
    handler: WorkspaceApiRequestHandler,
    rootDir: string,
    catalog: CompositeRepositoryCatalog,
  ) => Promise<Result>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-v4-api-"));
  const localCatalog = new LocalRepositoryCatalog(rootDir);
  let nextId = 0;
  const webDavRegistry: ConstructorParameters<typeof CompositeRepositoryCatalog>[1] = {
    async deleteManagedData() { return { status: "deleted" }; },
    async dispose() {},
    async getStore() { throw new Error("missing WebDAV store"); },
    hasEntry() { return false; },
    async initialize() {},
    async listEntries() { return { issues: [], repositories: [] }; },
    async register() { throw new Error("WebDAV registration is not used here"); },
    async renameConnection() { throw new Error("WebDAV rename is not used here"); },
    async removeConnection() { return false; },
    async retryDeletion() { return { status: "deleted" }; },
  };
  const catalog = new CompositeRepositoryCatalog(localCatalog, webDavRegistry, {
    createId: () =>
      `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
  });
  const builtInCatalog = new BuiltInCatalog(rootDir);
  const handler = createWorkspaceApiRequestHandler({
    catalog,
    mobileRuntime: {
      now: () => new Date("2026-07-26T12:00:00.000Z"),
      today: () => "2026-07-26",
    },
    security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
    builtInCatalog,
  });

  try {
    return await run(handler, rootDir, catalog);
  } finally {
    await catalog.dispose();
    await rm(rootDir, { force: true, recursive: true });
  }
}

function snapshotUrl(id: string) {
  return `/api/repositories/${encodeURIComponent(id)}/snapshot`;
}

async function createRepository(
  handler: WorkspaceApiRequestHandler,
  content = createContent(),
  label = "Stable label",
) {
  return dispatch<RepositoryDescriptorDto>(handler, {
    body: JSON.stringify({ adapter: "local", content, label }),
    headers: { "content-type": "application/json" },
    method: "POST",
    url: "/api/repositories",
  });
}

async function loadSnapshot(handler: WorkspaceApiRequestHandler, id: string) {
  const response = await dispatch(handler, { method: "GET", url: snapshotUrl(id) });

  expect(response.statusCode).toBe(200);
  return parseWorkspaceRepositorySnapshot(response.body);
}

async function commitSnapshot(
  handler: WorkspaceApiRequestHandler,
  id: string,
  content: WorkspaceRepositoryContentDto,
  baseRevision: RepositoryRevisionDto,
) {
  return dispatch<WorkspaceRepositoryCommitResultDto | RepositoryApiErrorDto>(handler, {
    body: JSON.stringify({ baseRevision, content }),
    headers: { "content-type": "application/json" },
    method: "PUT",
    url: snapshotUrl(id),
  });
}

describe("workspace API v4", () => {
  it("serves protected built-in descriptors and typed snapshot CAS", async () => {
    await withHandler(async (handler) => {
      const catalogResponse = await dispatch(handler, {
        method: "GET",
        url: "/api/built-ins",
      });
      expect(catalogResponse).toMatchObject({
        body: {
          issues: [],
          repositories: [
            { id: "journal", label: "日记", protected: true },
            { id: "todo", label: "代办", protected: true },
          ],
        },
        statusCode: 200,
      });

      const snapshotUrl = "/api/journal/snapshot";
      const loaded = await dispatch<{
        content: unknown;
        revision: string;
      }>(handler, { method: "GET", url: snapshotUrl });
      if (!loaded.body) throw new Error("Journal snapshot is missing");
      const content = appendJournalTestEntry(createEmptyJournalContent(), {
        createdAt: "2026-07-18T01:00:00.000Z",
        entryIndex: 1,
      });
      const committed = await dispatch<{ revision: string }>(handler, {
        body: JSON.stringify({
          baseRevision: loaded.body.revision,
          content,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl,
      });
      if (!committed.body) throw new Error("Journal commit is missing");
      expect(committed.statusCode).toBe(200);
      const tampered = tamperJournalTestEntryCreation(content, {
        createdAt: "2026-08-19T10:11:12.000Z",
        entryIndex: 1,
        timezoneOffsetMinutes: -300,
      });

      await expect(dispatch(handler, {
        body: JSON.stringify({
          baseRevision: committed.body.revision,
          content: tampered,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl,
      })).resolves.toMatchObject({
        body: { code: "invalid_request" },
        statusCode: 400,
      });
      await expect(dispatch(handler, {
        method: "GET",
        url: snapshotUrl,
      })).resolves.toMatchObject({
        body: { content, revision: committed.body.revision },
        statusCode: 200,
      });
      await expect(dispatch(handler, {
        body: JSON.stringify({
          baseRevision: loaded.body.revision,
          content,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl,
      })).resolves.toMatchObject({
        body: { code: "revision_conflict", currentRevision: committed.body.revision },
        statusCode: 409,
      });
      await expect(dispatch(handler, {
        method: "DELETE",
        url: snapshotUrl,
      })).resolves.toMatchObject({ statusCode: 405 });
      await expect(dispatch(handler, {
        body: "{}",
        headers: { "content-length": "2", "content-type": "application/json" },
        method: "POST",
        url: "/api/journal/retry",
      })).resolves.toMatchObject({ statusCode: 400 });
      await expect(dispatch(handler, {
        method: "POST",
        url: "/api/built-ins",
      })).resolves.toMatchObject({ statusCode: 405 });
    });
  });

  it("serves narrow no-store mobile Journal and Todo projections", async () => {
    await withHandler(async (handler) => {
      const journalSnapshot = await dispatch<{
        content: unknown;
        revision: string;
      }>(handler, { method: "GET", url: "/api/journal/snapshot" });

      if (!journalSnapshot.body) throw new Error("Journal snapshot is missing");
      let journal = appendJournalTestEntry(createEmptyJournalContent(), {
        createdAt: "2026-06-18T01:00:00.000Z",
        entryIndex: 1,
      });
      journal = appendJournalTestEntry(journal, {
        createdAt: "2026-07-18T01:00:00.000Z",
        entryIndex: 2,
      });
      await dispatch(handler, {
        body: JSON.stringify({
          baseRevision: journalSnapshot.body.revision,
          content: journal,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: "/api/journal/snapshot",
      });

      const todoSnapshot = await dispatch<{
        content: unknown;
        revision: string;
      }>(handler, { method: "GET", url: "/api/todo/snapshot" });

      if (!todoSnapshot.body) throw new Error("Todo snapshot is missing");
      let todo = appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
        name: "手机清单",
      });
      todo = appendTodoTestItem(todo, {
        collectionIndex: 1,
        createdAt: todoTimestamp(2),
        itemIndex: 1,
        text: "周期事项",
      });
      todo = appendTodoTestItem(todo, {
        collectionIndex: 1,
        createdAt: todoTimestamp(3),
        itemIndex: 2,
        level: 1,
        text: "普通子事项",
      });
      todo = setTodoBlockRecurrence(todo, createTodoParseIndex(todo), {
        blockId: todoBlockId(1),
        collectionId: todoCollectionId(1),
        rule: { interval: 1, kind: "daily" },
        stageId:
          "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
        today: "2026-07-26",
      });
      await dispatch(handler, {
        body: JSON.stringify({
          baseRevision: todoSnapshot.body.revision,
          content: todo,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: "/api/todo/snapshot",
      });

      const status = await dispatch(handler, {
        method: "GET",
        url: "/api/mobile/v1/status",
      });

      expect(status).toMatchObject({
        body: {
          capabilities: {
            journal: "read-only",
            todo: "completion-write",
          },
          contractVersion: 1,
          domains: {
            journal: { status: "ready" },
            todo: { status: "ready" },
          },
        },
        headers: { "cache-control": "no-store" },
        statusCode: 200,
      });

      const journalPage = await dispatch<{
        entries: Array<{ id: string; month: string; title: string }>;
        nextCursor: string | null;
        revision: string;
      }>(handler, {
        method: "GET",
        url: "/api/mobile/v1/journal/entries?limit=1",
      });

      expect(journalPage).toMatchObject({
        body: {
          entries: [{
            month: "2026-07",
            title: "2026-07-18-0001",
          }],
          nextCursor: expect.any(String),
        },
        statusCode: 200,
      });
      if (!journalPage.body?.nextCursor) {
        throw new Error("Expected a mobile Journal cursor");
      }
      const secondPage = await dispatch<{
        entries: Array<{ id: string; month: string }>;
        nextCursor: string | null;
      }>(handler, {
        method: "GET",
        url: `/api/mobile/v1/journal/entries?limit=1&cursor=${
          encodeURIComponent(journalPage.body.nextCursor)
        }`,
      });

      expect(secondPage.body).toMatchObject({
        entries: [{ month: "2026-06" }],
        nextCursor: null,
      });
      const entryId = journalPage.body.entries[0]?.id;

      if (!entryId) throw new Error("Expected a mobile Journal entry");
      const journalDetail = await dispatch(handler, {
        method: "GET",
        url: `/api/mobile/v1/journal/entries/${encodeURIComponent(entryId)}`,
      });

      expect(journalDetail).toMatchObject({
        body: {
          contractVersion: 1,
          entry: { id: entryId },
          revision: journalPage.body.revision,
        },
        statusCode: 200,
      });
      expect(JSON.stringify(journalDetail.body)).not.toContain("syntaxSource");
      expect(JSON.stringify(journalDetail.body)).not.toContain('"source"');
      expect(JSON.stringify(journalDetail.body)).not.toContain("schemaVersion");

      const collections = await dispatch<{
        collections: Array<{
          completedTaskCount: number;
          id: string;
          name: string;
          taskCount: number;
        }>;
        revision: string;
      }>(handler, {
        method: "GET",
        url: "/api/mobile/v1/todo/collections",
      });

      expect(collections.body).toMatchObject({
        collections: [{
          completedTaskCount: 0,
          id: todoCollectionId(1),
          name: "手机清单",
          taskCount: 2,
        }],
      });
      const todoDetail = await dispatch<{
        revision: `sha256:${string}`;
        tasks: Array<{
          children: Array<{ id: string }>;
          completed: boolean;
          id: string;
          recurrence: {
            completedCount: number;
            currentOccurrenceDate: string;
            totalCount: number;
          };
        }>;
      }>(handler, {
        method: "GET",
        url:
          `/api/mobile/v1/todo/collections/${encodeURIComponent(todoCollectionId(1))}`,
      });

      expect(todoDetail.body).toMatchObject({
        tasks: [{
          children: [{ id: todoBlockId(2) }],
          completed: false,
          id: todoBlockId(1),
          recurrence: {
            completedCount: 0,
            currentOccurrenceDate: "2026-07-26",
            totalCount: 1,
          },
        }],
      });
      expect(JSON.stringify(todoDetail.body)).not.toContain("syntaxSource");
      expect(JSON.stringify(todoDetail.body)).not.toContain('"source"');
      expect(JSON.stringify(todoDetail.body)).not.toContain("schemaVersion");
      if (!todoDetail.body) throw new Error("Expected mobile Todo detail");
      const completionUrl =
        `/api/mobile/v1/todo/collections/${encodeURIComponent(todoCollectionId(1))}` +
        `/tasks/${encodeURIComponent(todoBlockId(1))}/completion`;
      const completed = await dispatch<{
        revision: `sha256:${string}`;
        task: { completed: boolean };
      }>(handler, {
        body: JSON.stringify({
          completed: true,
          expectedRevision: todoDetail.body.revision,
          occurrenceDate: "2026-07-26",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: completionUrl,
      });

      expect(completed).toMatchObject({
        body: { contractVersion: 1, task: { completed: true } },
        headers: { "cache-control": "no-store" },
        statusCode: 200,
      });
      if (!completed.body) throw new Error("Expected completion result");
      await expect(dispatch(handler, {
        body: JSON.stringify({
          completed: false,
          expectedRevision: completed.body.revision,
          occurrenceDate: "2026-07-25",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: completionUrl,
      })).resolves.toMatchObject({
        body: {
          code: "stale_occurrence",
          contractVersion: 1,
          currentOccurrenceDate: "2026-07-26",
        },
        statusCode: 409,
      });
      await expect(dispatch(handler, {
        body: JSON.stringify({
          completed: false,
          expectedRevision: todoDetail.body.revision,
          occurrenceDate: "2026-07-26",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: completionUrl,
      })).resolves.toMatchObject({
        body: {
          code: "revision_conflict",
          contractVersion: 1,
          currentRevision: completed.body.revision,
        },
        statusCode: 409,
      });
    });
  });

  it("projects corrupt built-in data and retries without overwriting it", async () => {
    await withHandler(async (handler, rootDir) => {
      const journalPath = path.join(
        rootDir,
        ".built-ins",
        "journal",
        "content.json",
      );
      const corruptSource = "{broken\n";

      await dispatch(handler, { method: "GET", url: "/api/built-ins" });
      await writeFile(journalPath, corruptSource);
      const listed = await dispatch(handler, {
        method: "GET",
        url: "/api/built-ins",
      });
      expect(listed).toMatchObject({
        body: { issues: [{ id: "journal", status: "fault" }] },
        statusCode: 200,
      });
      expect(await readFile(journalPath, "utf8")).toBe(corruptSource);
      await expect(dispatch(handler, {
        method: "POST",
        url: "/api/journal/retry",
      })).resolves.toMatchObject({ body: { status: "fault" }, statusCode: 200 });

      await writeFile(journalPath, JSON.stringify(createEmptyJournalContent()));
      await expect(dispatch(handler, {
        method: "POST",
        url: "/api/journal/retry",
      })).resolves.toMatchObject({ body: { status: "ready" }, statusCode: 200 });
      await expect(dispatch(handler, {
        method: "GET",
        url: "/api/system-repositories/not-system/snapshot",
      })).resolves.toMatchObject({ statusCode: 404 });
    });
  });

  it("rejects a 10,000-level Local tree before publishing a partial repository", async () => {
    await withHandler(async (handler) => {
      const content = createDeepWorkspaceRepositoryContent(
        10_000,
        "Deep initial",
      );
      const created = await dispatch<RepositoryApiErrorDto>(handler, {
        body: serializeJsonIteratively({
          adapter: "local",
          content,
          label: "Deep tree",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "/api/repositories",
      });

      expect(created).toMatchObject({
        body: {
          code: "invalid_request",
          requestId: expect.any(String),
        },
        statusCode: 400,
      });
      await expect(dispatch<RepositoryCatalogDto>(handler, {
        method: "GET",
        url: "/api/repositories",
      })).resolves.toMatchObject({
        body: { issues: [], repositories: [] },
        statusCode: 200,
      });
    });
  }, 20_000);

  it("lists, creates, loads, and commits nested v4 content with a structured Local location", async () => {
    await withHandler(async (handler, rootDir) => {
      const listed = await dispatch(handler, { method: "GET", url: "/api/repositories" });

      expect(listed).toMatchObject({
        body: {
          creatableAdapters: ["local", "webdav"],
          issues: [],
          repositories: [],
        },
        statusCode: 200,
      });
      expect(listed.headers["cache-control"]).toBe("no-store");
      const created = await createRepository(
        handler,
        createContent("Workspace"),
        "Catalog",
      );
      const repositoryId = created.body?.id;

      expect(created).toMatchObject({
        body: {
          adapter: "local",
          id: expect.stringMatching(/^repository-[0-9a-f-]{36}$/),
          label: "Catalog",
          location: {
            hostPath: null,
            serverPath: expect.stringContaining(rootDir),
            type: "local",
          },
        },
        statusCode: 201,
      });
      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      expect(created.body?.location).toEqual({
        hostPath: null,
        serverPath: path.join(rootDir, repositoryId),
        type: "local",
      });
      const initial = await loadSnapshot(handler, repositoryId);

      expect(initial.content).toEqual(createContent("Workspace"));
      const committed = await commitSnapshot(
        handler,
        repositoryId,
        createContent("Renamed workspace"),
        initial.revision,
      );

      expect(committed.statusCode).toBe(200);
      await expect(loadSnapshot(handler, repositoryId)).resolves.toMatchObject({
        content: createContent("Renamed workspace"),
      });
      await expect(dispatch(handler, { method: "GET", url: "/api/repositories" }))
        .resolves.toMatchObject({
          body: { repositories: [expect.objectContaining({ label: "Catalog" })] },
        });
    });
  });

  it("renames only the ordinary catalog label and rejects duplicate or reserved names", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler, createContent("Content name"), "Before");
      const repositoryId = created.body?.id;

      if (!repositoryId) throw new Error("expected generated repository id");
      const before = await loadSnapshot(handler, repositoryId);
      const renamed = await dispatch<RepositoryDescriptorDto>(handler, {
        body: JSON.stringify({ label: "  After  " }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
        url: `/api/repositories/${encodeURIComponent(repositoryId)}`,
      });

      expect(renamed).toMatchObject({
        body: { id: repositoryId, label: "After", labelIssue: null },
        statusCode: 200,
      });
      await expect(loadSnapshot(handler, repositoryId)).resolves.toEqual(before);
      await expect(dispatch(handler, { method: "GET", url: "/api/repositories" }))
        .resolves.toMatchObject({
          body: { repositories: [expect.objectContaining({ label: "After" })] },
        });

      await createRepository(handler, createContent("Other content"), "Remote");
      for (const label of ["ＲＥＭＯＴＥ", "日记"]) {
        await expect(dispatch(handler, {
          body: JSON.stringify({ label }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
          url: `/api/repositories/${encodeURIComponent(repositoryId)}`,
        })).resolves.toMatchObject({
          body: { code: "invalid_request" },
          statusCode: 400,
        });
      }
      await expect(loadSnapshot(handler, repositoryId)).resolves.toEqual(before);
    });
  });

  it("rejects caller-supplied repository IDs at the create boundary", async () => {
    await withHandler(async (handler) => {
      const response = await dispatch<RepositoryApiErrorDto>(handler, {
        body: JSON.stringify({
          adapter: "local",
          content: createContent(),
          id: "manual-id",
          label: "Manual",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "/api/repositories",
      });

      expect(response).toMatchObject({
        body: { code: "invalid_request", requestId: expect.any(String) },
        statusCode: 400,
      });
    });
  });

  it("deletes Local managed data synchronously and remains idempotent", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      const deletionUrl =
        `/api/repositories/${encodeURIComponent(repositoryId)}` +
        "?mode=delete-managed-data";
      const deleted = await dispatch<RepositoryDeletionResultDto>(handler, {
        method: "DELETE",
        url: deletionUrl,
      });

      expect(deleted).toMatchObject({
        body: { status: "deleted" },
        headers: { "cache-control": "no-store" },
        statusCode: 200,
      });
      await expect(dispatch(handler, {
        method: "GET",
        url: snapshotUrl(repositoryId),
      })).resolves.toMatchObject({
        body: { code: "repository_not_found" },
        statusCode: 404,
      });
      await expect(dispatch(handler, {
        method: "DELETE",
        url: deletionUrl,
      })).resolves.toMatchObject({
        body: { status: "deleted" },
        statusCode: 200,
      });
    });
  });

  it("rejects DELETE bodies, missing/duplicate/extra queries, and adapter-mode mismatches", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      const encodedId = encodeURIComponent(repositoryId);
      const invalidRequests: RequestOptions[] = [
        { method: "DELETE", url: `/api/repositories/${encodedId}` },
        {
          method: "DELETE",
          url: `/api/repositories/${encodedId}?mode=delete-managed-data&mode=delete-managed-data`,
        },
        {
          method: "DELETE",
          url: `/api/repositories/${encodedId}?mode=delete-managed-data&extra=1`,
        },
        {
          method: "DELETE",
          url: `/api/repositories/${encodedId}?mode=unknown`,
        },
        {
          body: "{}",
          headers: { "content-length": "2" },
          method: "DELETE",
          url: `/api/repositories/${encodedId}?mode=delete-managed-data`,
        },
        {
          method: "DELETE",
          url: `/api/repositories/${encodedId}?mode=remove-connection`,
        },
      ];

      for (const request of invalidRequests) {
        const response = await dispatch<RepositoryApiErrorDto>(handler, request);

        expect(response).toMatchObject({
          body: { code: "invalid_request", requestId: expect.any(String) },
          headers: { "cache-control": "no-store" },
          statusCode: 400,
        });
      }
    });
  });

  it("returns 202 when remote cleanup has entered deleting state", async () => {
    const deleteRepository = vi.fn(async () => ({ status: "deleting" as const }));
    const catalog: WorkspaceRepositoryCatalog = {
      async createRepository() { throw new Error("unused"); },
      deleteRepository,
      async getStore() { throw new Error("unused"); },
      async listRepositories() {
        return {
          creatableAdapters: ["local", "webdav"],
          issues: [],
          repositories: [],
        };
      },
      async renameRepository() { throw new Error("unused"); },
    };
    const handler = createWorkspaceApiRequestHandler({
      catalog,
      security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
    });
    const response = await dispatch<RepositoryDeletionResultDto>(handler, {
      method: "DELETE",
      url: "/api/repositories/repository-remote?mode=delete-managed-data",
    });

    expect(response).toMatchObject({
      body: { status: "deleting" },
      headers: { "cache-control": "no-store" },
      statusCode: 202,
    });
    expect(deleteRepository).toHaveBeenCalledWith(
      "repository-remote",
      "delete-managed-data",
    );
  });

  it("returns one structured error DTO including conflicts", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      const base = await loadSnapshot(handler, repositoryId);
      const committed = await commitSnapshot(
        handler,
        repositoryId,
        createContent("new"),
        base.revision,
      );

      if (!committed.body || !("revision" in committed.body)) {
        throw new Error("expected commit result");
      }
      const stale = await commitSnapshot(
        handler,
        repositoryId,
        createContent("stale"),
        base.revision,
      );

      expect(stale).toMatchObject({
        body: {
          code: "revision_conflict",
          currentRevision: committed.body.revision,
          message: "Repository content changed outside the current session",
          requestId: expect.any(String),
        },
        statusCode: 409,
      });
      expect(stale.headers["cache-control"]).toBe("no-store");
      await expect(dispatch(handler, { method: "GET", url: snapshotUrl("missing") }))
        .resolves.toMatchObject({
          body: {
            code: "repository_not_found",
            message: "Repository does not exist: missing",
            requestId: expect.any(String),
          },
          statusCode: 404,
        });
    });
  });

  it("reports v2 wire input as unsupported instead of accepting fallback fields", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      const base = await loadSnapshot(handler, repositoryId);
      const response = await dispatch<RepositoryApiErrorDto>(handler, {
        body: JSON.stringify({
          baseRevision: base.revision,
          syntaxSourceFile: null,
          workspace: base.content.workspace,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl(repositoryId),
      });

      expect(response).toMatchObject({
        body: { code: "unsupported_repository_version", requestId: expect.any(String) },
        statusCode: 409,
      });
    });
  });

  it("rejects v3 content without overwriting the current v4 snapshot", async () => {
    await withHandler(async (handler) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      const before = await loadSnapshot(handler, repositoryId);
      const response = await dispatch<RepositoryApiErrorDto>(handler, {
        body: JSON.stringify({
          baseRevision: before.revision,
          content: {
            schemaVersion: 3,
            syntaxSource: null,
            workspace: before.content.workspace,
          },
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl(repositoryId),
      });

      expect(response).toMatchObject({
        body: {
          code: "unsupported_repository_version",
          requestId: expect.any(String),
        },
        statusCode: 409,
      });
      await expect(loadSnapshot(handler, repositoryId)).resolves.toEqual(before);
    });
  });

  it("redacts corruption and unknown 500 details while logging by request id", async () => {
    const logger = { error: vi.fn() };
    const repositoryPath =
      "/private/repositories/repository-01234567-89ab-4cde-8f01-23456789abcd/.ctn/index.json";
    const catalog: WorkspaceRepositoryCatalog = {
      async createRepository() {
        throw new Error(`Could not read '${repositoryPath}'`);
      },
      async deleteRepository() {
        throw new Error(`Could not read '${repositoryPath}'`);
      },
      async getStore() {
        throw new Error(`Could not read '${repositoryPath}'`);
      },
      async listRepositories() {
        throw new Error(`Could not read '${repositoryPath}'`);
      },
      async renameRepository() {
        throw new Error(`Could not read '${repositoryPath}'`);
      },
    };
    const handler = createWorkspaceApiRequestHandler({
      catalog,
      logger,
      security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
    });
    const response = await dispatch<RepositoryApiErrorDto>(handler, {
      method: "GET",
      url: "/api/repositories",
    });

    expect(response).toMatchObject({
      body: {
        code: "internal_error",
        message: "Internal server error",
        requestId: expect.any(String),
      },
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain("/private");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(response.body?.requestId ?? ""),
      expect.any(Error),
    );
    const loggedError = logger.error.mock.calls[0]?.[1] as Error;

    expect(loggedError.message).toContain("[repository-path]");
    expect(loggedError.message).not.toContain(repositoryPath);
    expect(loggedError.stack).not.toContain(repositoryPath);
  });

  it("redacts explicit internal adapter errors instead of trusting their messages", async () => {
    const privateDetail = "/private/webdav/path and remote response body";
    const handler = createWorkspaceApiRequestHandler({
      catalog: {
        async createRepository() { throw new Error("unused"); },
        async deleteRepository() { throw new Error("unused"); },
        async getStore() { throw new Error("unused"); },
        async listRepositories() {
          throw new RepositoryCatalogError("internal_error", privateDetail);
        },
        async renameRepository() { throw new Error("unused"); },
      },
      logger: { error: vi.fn() },
      security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
    });
    const response = await dispatch<RepositoryApiErrorDto>(handler, {
      method: "GET",
      url: "/api/repositories",
    });

    expect(response).toMatchObject({
      body: {
        code: "internal_error",
        message: "Internal server error",
        requestId: expect.any(String),
      },
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain(privateDetail);
  });

  it("never writes a WebDAV password into an error response or server log", async () => {
    const password = "server-only-super-secret";
    const logger = { error: vi.fn() };
    const handler = createWorkspaceApiRequestHandler({
      catalog: {
        async createRepository() {
          throw new Error(`WebDAV setup failed for ${password}`);
        },
        async deleteRepository() { throw new Error("unused"); },
        async getStore() { throw new Error("unused"); },
        async listRepositories() { throw new Error("unused"); },
        async renameRepository() { throw new Error("unused"); },
      },
      logger,
      security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
    });
    const response = await dispatch<RepositoryApiErrorDto>(handler, {
      body: JSON.stringify({
        adapter: "webdav",
        authentication: {
          password,
          type: "basic",
          username: "owner",
        },
        initialContent: createContent(),
        label: "Private WebDAV",
        url: "https://dav.example.test/notes/",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      url: "/api/repositories",
    });
    const loggedError = logger.error.mock.calls[0]?.[1];

    expect(response).toMatchObject({
      body: { code: "internal_error" },
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(loggedError).toBeInstanceOf(Error);
    expect((loggedError as Error).message).not.toContain(password);
    expect((loggedError as Error).stack).not.toContain(password);
  });

  it("returns corruption as a redacted issue without blocking catalog listing", async () => {
    await withHandler(async (handler, rootDir) => {
      const created = await createRepository(handler);
      const repositoryId = created.body?.id;

      if (!repositoryId) {
        throw new Error("expected generated repository id");
      }
      await writeFile(
        path.join(rootDir, repositoryId, ".ctn", "repository.json"),
        "not json",
      );
      const response = await dispatch(handler, { method: "GET", url: "/api/repositories" });

      expect(response).toMatchObject({
        body: {
          issues: [expect.objectContaining({
            adapter: "local",
            code: "repository_corrupt",
            id: repositoryId,
            location: {
              hostPath: null,
              serverPath: path.join(rootDir, repositoryId),
              type: "local",
            },
            status: "fault",
          })],
          repositories: [],
        },
        statusCode: 200,
      });
    });
  });

  it("uses structured authorization errors and no-store headers", async () => {
    const token = "x".repeat(32);
    const handler = createWorkspaceApiRequestHandler({
      catalog: {
        async createRepository() { throw new Error("unused"); },
        async deleteRepository() { throw new Error("unused"); },
        async getStore() { throw new Error("unused"); },
        async listRepositories() {
          return {
            creatableAdapters: ["local", "webdav"],
            issues: [],
            repositories: [],
          } as RepositoryCatalogDto;
        },
        async renameRepository() { throw new Error("unused"); },
      },
      security: createWorkspaceApiSecurityPolicy({
        bearerToken: token,
        host: "0.0.0.0",
        publicUrl: "https://api.example.test",
      }),
    });
    const response = await dispatch<RepositoryApiErrorDto>(handler, {
      headers: { host: "api.example.test", origin: "https://api.example.test" },
      method: "GET",
      url: "/api/health",
    });

    expect(response).toMatchObject({
      body: { code: "unauthorized", requestId: expect.any(String) },
      headers: {
        "access-control-allow-origin": "https://api.example.test",
        "cache-control": "no-store",
        "www-authenticate": "Bearer",
      },
      statusCode: 401,
    });
  });
});
