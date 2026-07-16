// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { serializeJsonIteratively } from "../../../contracts/workspace-repository/json";
import { parseWorkspaceRepositorySnapshot } from "../../../contracts/workspace-repository/parseRepository";
import type {
  RepositoryApiErrorDto,
  RepositoryDescriptorDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace-repository/types";
import { LocalRepositoryCatalog } from "../../../server/adapters/local/localRepositoryCatalog.ts";
import {
  createWorkspaceApiRequestHandler,
  type WorkspaceApiRequestHandler,
} from "../../../server/api/workspaceApiServer.ts";
import { createWorkspaceApiSecurityPolicy } from "../../../server/api/workspaceApiSecurity.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../../../server/repository/repositoryCatalog.ts";
import {
  createDeepRepositoryContent,
  inspectDeepRepositoryContent,
} from "../../storage/repositoryV3Fixtures";

function createContent(name = "本地笔记库"): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: null,
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
    catalog: LocalRepositoryCatalog,
  ) => Promise<Result>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-v3-api-"));
  const catalog = new LocalRepositoryCatalog(rootDir);
  const handler = createWorkspaceApiRequestHandler({
    catalog,
    security: createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" }),
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
  id: string,
  content = createContent(),
  label = "Stable label",
) {
  return dispatch<RepositoryDescriptorDto>(handler, {
    body: JSON.stringify({ content, id, label }),
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

describe("workspace API v3", () => {
  it("round-trips a 10,000-level tree through API input, Local storage, and API output", async () => {
    await withHandler(async (handler) => {
      const content = createDeepRepositoryContent(10_000, "Deep initial");
      const created = await dispatch(handler, {
        body: serializeJsonIteratively({ content, id: "deep", label: "Deep tree" }),
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "/api/repositories",
      });

      expect(created.statusCode).toBe(201);
      const initial = await loadSnapshot(handler, "deep");

      expect(inspectDeepRepositoryContent(initial.content)).toEqual({
        deepestFolder: {
          folderId: "folder-10000",
          title: 'Level 10000 · "深层"',
        },
        depth: 10_000,
        leaf: { kind: "note", noteId: "deep-note" },
        rootFolder: { folderId: "folder-1", title: 'Level 1 · "深层"' },
      });
      const nextContent = {
        ...initial.content,
        workspace: { ...initial.content.workspace, name: "Deep committed" },
      };
      const committed = await dispatch<WorkspaceRepositoryCommitResultDto>(handler, {
        body: serializeJsonIteratively({
          baseRevision: initial.revision,
          content: nextContent,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl("deep"),
      });

      expect(committed).toMatchObject({
        body: { revision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) },
        statusCode: 200,
      });
      const loaded = await loadSnapshot(handler, "deep");

      expect(loaded.content.workspace.name).toBe("Deep committed");
      expect(loaded.content.workspace.notes).toEqual(content.workspace.notes);
      expect(inspectDeepRepositoryContent(loaded.content)).toEqual({
        deepestFolder: {
          folderId: "folder-10000",
          title: 'Level 10000 · "深层"',
        },
        depth: 10_000,
        leaf: { kind: "note", noteId: "deep-note" },
        rootFolder: { folderId: "folder-1", title: 'Level 1 · "深层"' },
      });
    });
  }, 20_000);

  it("lists, creates, loads, and commits nested v3 content without path disclosure", async () => {
    await withHandler(async (handler, rootDir) => {
      const listed = await dispatch(handler, { method: "GET", url: "/api/repositories" });

      expect(listed).toMatchObject({ body: { issues: [], repositories: [] }, statusCode: 200 });
      expect(listed.headers["cache-control"]).toBe("no-store");
      const created = await createRepository(handler, "primary", createContent("Workspace"), "Catalog");

      expect(created).toMatchObject({
        body: {
          adapter: "local",
          id: "primary",
          label: "Catalog",
          locationLabel: "local:primary",
        },
        statusCode: 201,
      });
      expect(JSON.stringify(created.body)).not.toContain(rootDir);
      const initial = await loadSnapshot(handler, "primary");

      expect(initial.content).toEqual(createContent("Workspace"));
      const committed = await commitSnapshot(
        handler,
        "primary",
        createContent("Renamed workspace"),
        initial.revision,
      );

      expect(committed.statusCode).toBe(200);
      await expect(loadSnapshot(handler, "primary")).resolves.toMatchObject({
        content: createContent("Renamed workspace"),
      });
      await expect(dispatch(handler, { method: "GET", url: "/api/repositories" }))
        .resolves.toMatchObject({
          body: { repositories: [expect.objectContaining({ label: "Catalog" })] },
        });
    });
  });

  it("returns one structured error DTO including conflicts", async () => {
    await withHandler(async (handler) => {
      await createRepository(handler, "primary");
      const base = await loadSnapshot(handler, "primary");
      const committed = await commitSnapshot(handler, "primary", createContent("new"), base.revision);

      if (!committed.body || !("revision" in committed.body)) {
        throw new Error("expected commit result");
      }
      const stale = await commitSnapshot(handler, "primary", createContent("stale"), base.revision);

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
      await createRepository(handler, "primary");
      const base = await loadSnapshot(handler, "primary");
      const response = await dispatch<RepositoryApiErrorDto>(handler, {
        body: JSON.stringify({
          baseRevision: base.revision,
          syntaxSourceFile: null,
          workspace: base.content.workspace,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
        url: snapshotUrl("primary"),
      });

      expect(response).toMatchObject({
        body: { code: "unsupported_repository_version", requestId: expect.any(String) },
        statusCode: 409,
      });
    });
  });

  it("redacts corruption and unknown 500 details while logging by request id", async () => {
    const logger = { error: vi.fn() };
    const catalog: WorkspaceRepositoryCatalog = {
      async createRepository() {
        throw new Error("/private/repositories/secret stack detail");
      },
      async getStore() {
        throw new Error("/private/repositories/secret stack detail");
      },
      async listRepositories() {
        throw new Error("/private/repositories/secret stack detail");
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
  });

  it("redacts explicit internal adapter errors instead of trusting their messages", async () => {
    const privateDetail = "/private/webdav/path and remote response body";
    const handler = createWorkspaceApiRequestHandler({
      catalog: {
        async createRepository() { throw new Error("unused"); },
        async getStore() { throw new Error("unused"); },
        async listRepositories() {
          throw new RepositoryCatalogError("internal_error", privateDetail);
        },
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

  it("returns corruption as a redacted issue without blocking catalog listing", async () => {
    await withHandler(async (handler, rootDir) => {
      await createRepository(handler, "primary");
      await writeFile(path.join(rootDir, "primary", "repository.json"), "not json");
      const response = await dispatch(handler, { method: "GET", url: "/api/repositories" });

      expect(response).toMatchObject({
        body: {
          issues: [expect.objectContaining({ code: "repository_corrupt", id: "primary" })],
          repositories: [],
        },
        statusCode: 200,
      });
      expect(JSON.stringify(response.body)).not.toContain(rootDir);
    });
  });

  it("uses structured authorization errors and no-store headers", async () => {
    const token = "x".repeat(32);
    const handler = createWorkspaceApiRequestHandler({
      catalog: {
        async createRepository() { throw new Error("unused"); },
        async getStore() { throw new Error("unused"); },
        async listRepositories() { return { issues: [], repositories: [] }; },
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
