// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
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
import { describe, expect, it } from "vitest";
import type {
  ApiV1CommandResultDto,
  ApiV1CreatedTokenDto,
  ApiV1CtnDocumentDto,
  ApiV1JournalEntriesDto,
  ApiV1SearchResponseDto,
  ApiV1TodoCollectionDto,
  ApiV1TodoCollectionsDto,
  ApiV1WorkspaceTreeDto,
} from "../../../contracts/api/types";
import type {
  RepositoryDescriptorDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types";
import { createInitialRepositoryContent } from "../../../application/workspace/session/initialRepository";
import { LocalRepositoryCatalog } from "../../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import {
  createApiV1RequestHandler,
  type ApiV1RequestHandler,
} from "../../../infrastructure/server/api/apiV1Server.ts";
import {
  createApiV1SecurityPolicy,
} from "../../../infrastructure/server/api/apiV1Security.ts";
import { CompositeRepositoryCatalog } from "../../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";
import { BuiltInCatalog } from "../../../infrastructure/server/repository/builtInCatalog.ts";
import type { ApiV1Runtime } from "../../../infrastructure/server/api/apiV1Runtime.ts";
import {
  createApiV1WorkspaceAnalysis,
  projectApiV1WorkspaceNote,
} from "../../../infrastructure/server/api/apiV1Resources.ts";
import {
  executeApiV1WorkspaceCommand,
} from "../../../infrastructure/server/api/apiV1WorkspaceCommands.ts";
import {
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../../infrastructure/server/repository/repositoryStore.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../../../infrastructure/server/repository/repositoryCatalog.ts";
import type {
  ApiV1BuiltInCatalog,
} from "../../../infrastructure/server/api/apiV1Ports.ts";
import {
  ApiV1SearchService,
} from "../../../infrastructure/server/api/apiV1Search.ts";
import type { ApiV1PrincipalDto } from "../../../contracts/api/types.ts";

type RequestOptions = {
  body?: unknown;
  headers?: IncomingHttpHeaders;
  method: string;
  token?: string;
  url: string;
};

type TestServerResponse = {
  body: string;
  destroyed: boolean;
  ended: boolean;
  headers: Record<string, OutgoingHttpHeader>;
  headersSent: boolean;
  statusCode: number;
  destroy(): void;
  end(chunk?: string | Buffer): void;
  once(): TestServerResponse;
  setHeader(name: string, value: OutgoingHttpHeader): void;
  write(chunk: string | Buffer): boolean;
  writeHead(statusCode: number, headers: OutgoingHttpHeaders): void;
};

function createRequest({
  body,
  headers = {},
  method,
  token,
  url,
}: RequestOptions) {
  const source = body === undefined ? "" : JSON.stringify(body);

  return Object.assign(Readable.from(source ? [Buffer.from(source)] : []), {
    headers: {
      host: "127.0.0.1:3001",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    method,
    url,
  }) as IncomingMessage;
}

function createResponse(): TestServerResponse {
  return {
    body: "",
    destroyed: false,
    ended: false,
    headers: {},
    headersSent: false,
    statusCode: 200,
    destroy() {
      this.destroyed = true;
    },
    end(chunk = "") {
      this.body += chunk.toString();
      this.ended = true;
    },
    once() {
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      this.body += chunk.toString();
      return true;
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headersSent = true;
      Object.entries(headers).forEach(([name, value]) => {
        if (value !== undefined) this.setHeader(name, value);
      });
    },
  };
}

async function dispatchRaw(
  handler: ApiV1RequestHandler,
  options: RequestOptions,
) {
  const response = createResponse();

  await handler(
    createRequest(options),
    response as unknown as ServerResponse,
  );
  return response;
}

async function dispatch<Body>(
  handler: ApiV1RequestHandler,
  options: RequestOptions,
) {
  const response = await dispatchRaw(handler, options);

  return {
    body: response.body ? JSON.parse(response.body) as Body : null,
    headers: response.headers,
    statusCode: response.statusCode,
  };
}

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createContent(): WorkspaceRepositoryContentDto {
  let nextId = 100;

  return createInitialRepositoryContent({
    createBlockId: () => uuid(nextId++),
    createNoteId: () => `note-${uuid(nextId++)}`,
    createSyntaxFileId: () => `syntax-${uuid(nextId++)}`,
    createWorkspaceId: () => `workspace-${uuid(nextId++)}`,
    name: "API 笔记",
    timestamp: "2026-07-29T08:00:00.000Z",
  });
}

function createRuntime(): ApiV1Runtime {
  let nextId = 1_000;

  return {
    createId: () => uuid(nextId++),
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    timezoneOffsetMinutes: () => 480,
    today: () => "2026-07-29",
  };
}

async function withHandler(
  run: (
    handler: ApiV1RequestHandler,
    rootDir: string,
    createAuthenticatedHandler: (
      ownerToken: string,
    ) => ApiV1RequestHandler,
  ) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-api-v1-"));
  const local = new LocalRepositoryCatalog(rootDir);
  let nextRepositoryId = 1;
  const remote: ConstructorParameters<typeof CompositeRepositoryCatalog>[1] = {
    async deleteManagedData() {
      return { status: "deleted" };
    },
    async dispose() {},
    async getStore() {
      throw new Error("WebDAV is not configured");
    },
    hasEntry() {
      return false;
    },
    async initialize() {},
    async listEntries() {
      return { issues: [], repositories: [] };
    },
    async register() {
      throw new Error("WebDAV is not used by this test");
    },
    async removeConnection() {
      return false;
    },
    async renameConnection() {
      throw new Error("WebDAV is not used by this test");
    },
    async retryDeletion() {
      return { status: "deleted" };
    },
  };
  const catalog = new CompositeRepositoryCatalog(local, remote, {
    createId: () => uuid(nextRepositoryId++),
  });
  const builtInCatalog = new BuiltInCatalog(rootDir);
  const runtime = createRuntime();
  const stateDirectory = path.join(rootDir, "server-state");
  const createHandler = (ownerToken?: string) =>
    createApiV1RequestHandler({
      builtInCatalog,
      catalog,
      runtime,
      security: createApiV1SecurityPolicy({
        ...(ownerToken ? { bearerToken: ownerToken } : {}),
        host: "127.0.0.1",
      }),
      stateDirectory,
    });

  await catalog.initialize();
  await builtInCatalog.initialize();
  try {
    await run(
      createHandler(),
      rootDir,
      (ownerToken) => createHandler(ownerToken),
    );
  } finally {
    await catalog.dispose();
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function createRepository(handler: ApiV1RequestHandler) {
  const response = await dispatch<RepositoryDescriptorDto>(handler, {
    body: {
      adapter: "local",
      content: createContent(),
      label: "API 仓库",
    },
    method: "POST",
    url: "/api/v1/admin/repositories",
  });

  expect(response.statusCode).toBe(201);
  return response.body!;
}

const commandId = (index: number) => uuid(9_000 + index);
const revision = (character: string) =>
  `sha256:${character.repeat(64)}` as `sha256:${string}`;

describe("CTN API v1", () => {
  it("owns routing, OpenAPI, sync and rejects every retired API surface", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch<{ ok: boolean }>(handler, {
          method: "GET",
          url: "/api/v1/health",
        }),
      ).resolves.toMatchObject({
        body: { ok: true },
        statusCode: 200,
      });
      const openapi = await dispatch<Record<string, unknown>>(handler, {
        method: "GET",
        url: "/api/v1/openapi.json",
      });

      expect(openapi.body).toMatchObject({ openapi: "3.1.0" });
      const paths = openapi.body!.paths as Record<
        string,
        Record<string, {
          operationId: string;
          "x-ctn-required-scopes": string[];
        }>
      >;
      const operations = Object.entries(paths).flatMap(([route, methods]) =>
        Object.values(methods).map((operation) => ({ operation, route }))
      );
      const searchResponse = (
        paths["/api/v1/search"]!.post as unknown as {
          responses: Record<string, {
            content: Record<string, {
              schema: { required: string[] };
            }>;
          }>;
        }
      ).responses["200"]!.content["application/json"]!.schema;

      expect(searchResponse.required).toEqual(
        expect.arrayContaining(["cursor", "faults", "results"]),
      );

      expect(
        new Set(operations.map(({ operation }) => operation.operationId)).size,
      ).toBe(operations.length);
      for (const { operation } of operations.filter(({ route }) =>
        route.startsWith("/api/v1/admin/") ||
        route.startsWith("/api/v1/sync/")
      )) {
        expect(operation["x-ctn-required-scopes"]).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^(repository:admin|sync|syntax:write|token:manage)$/,
            ),
          ]),
        );
      }
      expect(
        (
          paths["/api/v1/admin/tokens"]!.post as unknown as {
            responses: Record<string, unknown>;
          }
        ).responses,
      ).toMatchObject({ "201": expect.any(Object) });
      expect(
        (
          paths["/api/v1/admin/tokens"]!.post as unknown as {
            responses: Record<string, unknown>;
          }
        ).responses,
      ).not.toHaveProperty("200");
      const repository = await createRepository(handler);
      const snapshot = await dispatch<{ revision: string }>(handler, {
        method: "GET",
        url: `/api/v1/sync/workspaces/${repository.id}`,
      });

      expect(snapshot.body?.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
      for (const url of [
        "/api/health",
        "/api/repositories",
        `/api/repositories/${repository.id}/snapshot`,
        "/api/journal/snapshot",
        "/api/todo/snapshot",
        "/api/mobile/v1/status",
        "/api/mobile/v2/status",
      ]) {
        const retired = await dispatch<{ code: string }>(handler, {
          method: "GET",
          url,
        });

        expect(retired).toMatchObject({
          body: { code: "not_found" },
          statusCode: 404,
        });
      }
    });
  });

  it("previews and idempotently commits Workspace commands by resource version", async () => {
    await withHandler(async (handler) => {
      const repository = await createRepository(handler);
      const tree = await dispatch<ApiV1WorkspaceTreeDto>(handler, {
        method: "GET",
        url: `/api/v1/workspaces/${repository.id}/tree`,
      });
      const note = tree.body!.nodes.find((node) => node.kind === "note")!;
      const document = await dispatch<ApiV1CtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v1/workspaces/${repository.id}/notes/${note.noteId}`,
      });
      const editableText = `${document.body!.title}\n: API 新正文`;
      const base = {
        commandId: commandId(1),
        editableText,
        expectedVersion: document.body!.version,
        kind: "replace-note-source",
        noteId: note.noteId,
      };
      const preview = await dispatch<ApiV1CommandResultDto>(handler, {
        body: { ...base, mode: "preview" },
        method: "POST",
        url: `/api/v1/workspaces/${repository.id}/commands`,
      });

      expect(preview.body).toMatchObject({
        status: "previewed",
      });
      if (preview.body?.status !== "previewed") {
        throw new Error("expected command preview");
      }
      expect(preview.body!.diff).not.toEqual([]);
      const unchanged = await dispatch<ApiV1CtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v1/workspaces/${repository.id}/notes/${note.noteId}`,
      });

      expect(unchanged.body!.editableText).toBe(document.body!.editableText);
      const [committed, repeated] = await Promise.all([
        dispatch<ApiV1CommandResultDto>(handler, {
          body: { ...base, mode: "commit" },
          method: "POST",
          url: `/api/v1/workspaces/${repository.id}/commands`,
        }),
        dispatch<ApiV1CommandResultDto>(handler, {
          body: { ...base, mode: "commit" },
          method: "POST",
          url: `/api/v1/workspaces/${repository.id}/commands`,
        }),
      ]);

      expect(committed.body).toMatchObject({ status: "committed" });
      expect(committed.body).not.toHaveProperty("diff");
      expect(repeated.body).toEqual(committed.body);
      const reusedCommandId = await dispatch<{ code: string }>(handler, {
        body: {
          ...base,
          editableText: `${editableText}\n复用`,
          mode: "commit",
        },
        method: "POST",
        url: `/api/v1/workspaces/${repository.id}/commands`,
      });

      expect(reusedCommandId).toMatchObject({
        body: { code: "idempotency_conflict" },
        statusCode: 409,
      });
      const conflict = await dispatch<{ code: string }>(handler, {
        body: {
          ...base,
          commandId: commandId(2),
          editableText: `${editableText}\n冲突`,
          mode: "commit",
        },
        method: "POST",
        url: `/api/v1/workspaces/${repository.id}/commands`,
      });

      expect(conflict).toMatchObject({
        body: { code: "resource_conflict" },
        statusCode: 409,
      });
    });
  });

  it("replays a Workspace command after unrelated repository CAS movement", async () => {
    let content = createContent();
    let currentRevision = revision("a");
    let commitAttempts = 0;
    const note = content.workspace.notes[0]!;
    const document = projectApiV1WorkspaceNote(
      createApiV1WorkspaceAnalysis(content),
      note.id,
    )!;
    const store: WorkspaceRepositoryStore = {
      async commitSnapshot(value) {
        const commit = value as WorkspaceRepositoryCommitDto;

        commitAttempts += 1;
        if (commitAttempts === 1) {
          content = {
            ...content,
            workspace: {
              ...content.workspace,
              name: "并发改名",
            },
          };
          currentRevision = revision("b");
          throw new WorkspaceRevisionConflictError(currentRevision);
        }
        expect(commit.baseRevision).toBe(currentRevision);
        content = structuredClone(commit.content);
        currentRevision = revision("c");
        return { revision: currentRevision };
      },
      async loadSnapshot() {
        return {
          content: structuredClone(content),
          revision: currentRevision,
        };
      },
    };
    const result = await executeApiV1WorkspaceCommand({
      command: {
        commandId: commandId(5),
        editableText: `${document.editableText}\n: CAS 重放`,
        expectedVersion: document.version,
        kind: "replace-note-source",
        mode: "commit",
        noteId: note.id,
      },
      repositoryId: "repository-replay",
      runtime: createRuntime(),
      store,
    });

    expect(result).toMatchObject({
      revision: revision("c"),
      status: "committed",
    });
    expect(commitAttempts).toBe(2);
    expect(content.workspace.name).toBe("并发改名");
    expect(content.workspace.notes[0]!.source).toContain("CAS 重放");
  });

  it("projects Journal and Todo resources and timestamps Todo semantic changes", async () => {
    await withHandler(async (handler) => {
      const journal = await dispatch<ApiV1JournalEntriesDto>(handler, {
        method: "GET",
        url: "/api/v1/journal/entries",
      });
      const createdEntry = await dispatch<ApiV1CommandResultDto>(handler, {
        body: {
          body: ": 记录 API",
          commandId: commandId(10),
          expectedEntriesVersion: journal.body!.entriesVersion,
          kind: "create-entry",
          mode: "commit",
        },
        method: "POST",
        url: "/api/v1/journal/commands",
      });
      if (
        createdEntry.body?.result.kind !== "journal-entry-created"
      ) {
        throw new Error("expected created journal entry");
      }
      const entryId = createdEntry.body.result.entryId;
      const entry = await dispatch<ApiV1CtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v1/journal/entries/${entryId}`,
      });

      expect(entry.body).toMatchObject({
        editableText: ": 记录 API",
        resourceId: entryId,
        textMode: "body",
      });

      const todo = await dispatch<ApiV1TodoCollectionsDto>(handler, {
        method: "GET",
        url: "/api/v1/todo/collections",
      });
      const createdCollection = await dispatch<ApiV1CommandResultDto>(handler, {
        body: {
          body: "[] 远程任务\n[] 远程任务二",
          commandId: commandId(11),
          expectedOrderVersion: todo.body!.orderVersion,
          kind: "create-collection",
          mode: "commit",
          name: "远程集合",
        },
        method: "POST",
        url: "/api/v1/todo/commands",
      });
      if (
        createdCollection.body?.result.kind !==
          "todo-collection-created"
      ) {
        throw new Error("expected created Todo collection");
      }
      const collectionId = createdCollection.body.result.collectionId;
      const collection = await dispatch<ApiV1TodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v1/todo/collections/${collectionId}`,
      });
      const item = collection.body!.items[0]!;
      const completed = await dispatch<ApiV1CommandResultDto>(handler, {
        body: {
          blockId: item.blockId,
          collectionId,
          commandId: commandId(12),
          completed: true,
          expectedStateVersion: item.stateVersion,
          kind: "set-completion",
          mode: "commit",
          occurrenceDate: null,
        },
        method: "POST",
        url: "/api/v1/todo/commands",
      });

      expect(completed.body!.changes.blocks).toContainEqual(
        expect.objectContaining({
          blockId: item.blockId,
          kind: "state-updated",
          updatedAt: "2026-07-29T12:00:00.000Z",
        }),
      );
      const updated = await dispatch<ApiV1TodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v1/todo/collections/${collectionId}`,
      });

      expect(updated.body!.items[0]).toMatchObject({ completed: true });
      expect(
        updated.body!.document.blocks.find(
          ({ blockId }) => blockId === item.blockId,
        )?.updatedAt,
      ).toBe("2026-07-29T12:00:00.000Z");
      const recurring = await dispatch<ApiV1CommandResultDto>(handler, {
        body: {
          blockId: item.blockId,
          collectionId,
          commandId: commandId(13),
          expectedStateVersion: updated.body!.items[0]!.stateVersion,
          kind: "set-recurrence",
          mode: "commit",
          rule: { interval: 1, kind: "daily" },
        },
        method: "POST",
        url: "/api/v1/todo/commands",
      });

      expect(recurring.statusCode).toBe(200);
      const active = await dispatch<ApiV1TodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v1/todo/collections/${collectionId}`,
      });

      expect(active.body!.items[0]).toMatchObject({
        completed: true,
        recurrence: {
          active: true,
          completedCount: 1,
          currentOccurrenceDate: "2026-07-29",
          totalCount: 1,
        },
      });
      await dispatch<ApiV1CommandResultDto>(handler, {
        body: {
          blockId: item.blockId,
          collectionId,
          commandId: commandId(14),
          expectedStateVersion: active.body!.items[0]!.stateVersion,
          kind: "stop-recurrence",
          mode: "commit",
        },
        method: "POST",
        url: "/api/v1/todo/commands",
      });
      const stopped = await dispatch<ApiV1TodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v1/todo/collections/${collectionId}`,
      });

      expect(stopped.body!.items[0]).toMatchObject({
        completed: true,
        recurrence: {
          active: false,
          completedCount: 1,
          currentOccurrenceDate: null,
          nextOccurrenceDate: null,
          totalCount: 1,
        },
      });
      const search = await dispatch<ApiV1SearchResponseDto>(handler, {
        body: {
          domains: ["todo"],
          limit: 1,
          query: "远程",
        },
        method: "POST",
        url: "/api/v1/search",
      });

      expect(search.body).toMatchObject({
        cursor: expect.any(String),
        faults: [],
        results: [{
          domain: "todo",
          resourceId: collectionId,
          version: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        }],
      });
      const ordinaryCompletion = await dispatch<ApiV1CommandResultDto>(
        handler,
        {
          body: {
            blockId: item.blockId,
            collectionId,
            commandId: commandId(15),
            completed: false,
            expectedStateVersion: stopped.body!.items[0]!.stateVersion,
            kind: "set-completion",
            mode: "commit",
            occurrenceDate: null,
          },
          method: "POST",
          url: "/api/v1/todo/commands",
        },
      );
      const ordinary = await dispatch<ApiV1TodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v1/todo/collections/${collectionId}`,
      });

      expect(ordinaryCompletion.statusCode).toBe(200);
      expect(ordinary.body!.items[0]).toMatchObject({
        completed: false,
        recurrence: {
          active: false,
          completedCount: 1,
        },
      });
      const staleSearchPage = await dispatch<{ code: string }>(handler, {
        body: {
          cursor: search.body!.cursor,
          domains: ["todo"],
          limit: 1,
          query: "远程",
        },
        method: "POST",
        url: "/api/v1/search",
      });

      expect(staleSearchPage).toMatchObject({
        body: {
          code: "resource_conflict",
          details: { restartRequired: true },
        },
        statusCode: 409,
      });
      const staleOccurrence = await dispatch<{ code: string }>(handler, {
        body: {
          blockId: item.blockId,
          collectionId,
          commandId: commandId(16),
          completed: true,
          expectedStateVersion: ordinary.body!.items[0]!.stateVersion,
          kind: "set-completion",
          mode: "commit",
          occurrenceDate: "2026-07-29",
        },
        method: "POST",
        url: "/api/v1/todo/commands",
      });

      expect(staleOccurrence).toMatchObject({
        body: {
          code: "occurrence_conflict",
          details: { currentOccurrenceDate: null },
        },
        statusCode: 409,
      });
    });
  });

  it("issues scoped automation tokens, audits commits and streams checkpoints", async () => {
    await withHandler(async (_handler, _rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const handler = authenticated(ownerToken);
      const repository = await dispatch<RepositoryDescriptorDto>(handler, {
        body: {
          adapter: "local",
          content: createContent(),
          label: "受控仓库",
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v1/admin/repositories",
      });
      const otherRepository = await dispatch<RepositoryDescriptorDto>(
        handler,
        {
          body: {
            adapter: "local",
            content: createContent(),
            label: "未授权仓库",
          },
          method: "POST",
          token: ownerToken,
          url: "/api/v1/admin/repositories",
        },
      );
      const createdToken = await dispatch<ApiV1CreatedTokenDto>(handler, {
        body: {
          name: "AI 工具",
          repositoryIds: [repository.body!.id],
          scopes: ["workspace:read", "workspace:write"],
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v1/admin/tokens",
      });
      const secret = createdToken.body!.secret;
      const capabilities = await dispatch<{
        principal: { kind: string; name: string };
      }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v1/capabilities",
      });

      expect(capabilities.body?.principal).toMatchObject({
        kind: "automation",
        name: "AI 工具",
      });
      const forbidden = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v1/journal/entries",
      });

      expect(forbidden).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const disallowedRepository = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v1/workspaces/${otherRepository.body!.id}/tree`,
      });
      const privilegedSnapshot = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v1/sync/workspaces/${repository.body!.id}`,
      });

      expect(disallowedRepository).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      expect(privilegedSnapshot).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const tree = await dispatch<ApiV1WorkspaceTreeDto>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v1/workspaces/${repository.body!.id}/tree`,
      });
      const events = await dispatchRaw(handler, {
        method: "GET",
        token: secret,
        url: "/api/v1/events",
      });
      const createFolderCommand = {
        commandId: commandId(20),
        expectedTreeVersion: tree.body!.version,
        kind: "create-folder",
        mode: "commit",
        parentFolderId: null,
        title: "AI 文件夹",
      };
      const [createdFolder, replayedFolder] = await Promise.all([
        dispatch<ApiV1CommandResultDto>(handler, {
          body: createFolderCommand,
          method: "POST",
          token: secret,
          url: `/api/v1/workspaces/${repository.body!.id}/commands`,
        }),
        dispatch<ApiV1CommandResultDto>(handler, {
          body: createFolderCommand,
          method: "POST",
          token: secret,
          url: `/api/v1/workspaces/${repository.body!.id}/commands`,
        }),
      ]);

      expect(replayedFolder.body).toEqual(createdFolder.body);
      const updatedTree = await dispatch<ApiV1WorkspaceTreeDto>(handler, {
        method: "GET",
        token: secret,
        url: `/api/v1/workspaces/${repository.body!.id}/tree`,
      });
      const deleteWithoutScope = await dispatch<{ code: string }>(handler, {
        body: {
          commandId: commandId(21),
          confirm: true,
          expectedTreeVersion: updatedTree.body!.version,
          folderId: createdFolder.body?.result.kind === "folder-created"
            ? createdFolder.body.result.folderId
            : "",
          kind: "delete-folder",
          mode: "commit",
        },
        method: "POST",
        token: secret,
        url: `/api/v1/workspaces/${repository.body!.id}/commands`,
      });

      expect(deleteWithoutScope).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
      const audit = await dispatch<{
        entries: Array<{ commandId: string; principalId: string }>;
      }>(handler, {
        method: "GET",
        token: ownerToken,
        url: "/api/v1/admin/audit",
      });

      expect(audit.body!.entries[0]).toMatchObject({
        commandId: commandId(20),
        principalId: createdToken.body!.token.id,
      });
      expect(
        audit.body!.entries.filter(({ commandId: id }) =>
          id === commandId(20)
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(audit.body)).not.toContain(secret);
      expect(JSON.stringify(audit.body)).not.toContain("AI 文件夹");

      expect(events.statusCode).toBe(200);
      expect(events.headers["content-type"]).toContain("text/event-stream");
      expect(events.body).toContain("event: checkpoint");
      expect(events.body).toContain("event: change");
      expect(events.body).toContain('"changes"');
      expect(events.body).not.toContain("editableText");
      const streamed = events.body
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) =>
          JSON.parse(line.slice("data: ".length)) as {
            checkpoint: { streamId: string };
            streamId: string;
          }
        );

      expect(streamed).toHaveLength(2);
      expect(streamed.every(({ checkpoint, streamId }) =>
        checkpoint.streamId === streamId &&
        streamId === streamed[0]!.streamId
      )).toBe(true);
      const revoked = await dispatch<{ revoked: boolean }>(handler, {
        method: "DELETE",
        token: ownerToken,
        url: `/api/v1/admin/tokens/${createdToken.body!.token.id}`,
      });

      expect(revoked).toMatchObject({
        body: { revoked: true },
        statusCode: 200,
      });
      expect(events.ended).toBe(true);
      const afterRevocation = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: secret,
        url: "/api/v1/capabilities",
      });

      expect(afterRevocation).toMatchObject({
        body: { code: "unauthorized" },
        statusCode: 401,
      });
    });
  });

  it("returns sanitized source faults without discarding readable search results", async () => {
    const goodContent = createContent();
    const descriptors: RepositoryDescriptorDto[] = [
      {
        adapter: "local",
        id: "good",
        label: "可读仓库",
        labelIssue: null,
        location: {
          hostPath: null,
          serverPath: "/repositories/good",
          type: "local",
        },
      },
      {
        adapter: "local",
        id: "broken",
        label: "损坏仓库",
        labelIssue: null,
        location: {
          hostPath: null,
          serverPath: "/repositories/broken",
          type: "local",
        },
      },
    ];
    const catalog: WorkspaceRepositoryCatalog = {
      async createRepository() {
        throw new Error("not used");
      },
      async deleteRepository() {
        return { status: "deleted" };
      },
      async getStore(repositoryId: string) {
        return {
          async commitSnapshot() {
            return { revision: revision("f") };
          },
          async loadSnapshot() {
            if (repositoryId === "broken") {
              throw new Error("/private/repository/content.json is invalid");
            }
            return { content: goodContent, revision: revision("a") };
          },
        };
      },
      async listRepositories() {
        return {
          creatableAdapters: ["local" as const],
          issues: [],
          repositories: descriptors,
        };
      },
      async renameRepository() {
        throw new Error("not used");
      },
    };
    const principal: ApiV1PrincipalDto = {
      id: "owner",
      kind: "owner",
      name: "Owner",
      repositoryIds: null,
      scopes: ["workspace:read"],
    };
    const search = new ApiV1SearchService({
      builtInCatalog: {} as ApiV1BuiltInCatalog,
      catalog,
      runtime: createRuntime(),
    });
    const response = await search.search({
      domains: ["workspace"],
      query: "未命名笔记",
    }, principal);

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.every((result) =>
      result.domain === "workspace" &&
      result.repositoryId === "good"
    )).toBe(true);
    expect(response.faults).toEqual([{
      code: "source_invalid",
      domain: "workspace",
      message: "Search source contains invalid data",
      repositoryId: "broken",
    }]);
    expect(JSON.stringify(response)).not.toContain("/private/");
  });
});
