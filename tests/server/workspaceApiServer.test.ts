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
import { parseWorkspaceRepositorySnapshot } from "../../contracts/workspace-repository/parseRepository";
import type {
  RepositoryDescriptorDto,
  RepositoryWorkspaceDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types";
import { LocalRepositoryCatalog } from "../../server/localRepositoryCatalog.ts";
import {
  createWorkspaceApiRequestHandler,
  parseWorkspaceApiAllowedOrigins,
  type WorkspaceApiRequestHandler,
} from "../../server/workspaceApiServer.ts";

function createWorkspace(name = "本地笔记库") {
  return {
    id: "local-workspace",
    name,
    notes: [],
    tree: [],
  };
}

function createContent(name = "本地笔记库"): WorkspaceRepositoryContentDto {
  return { syntaxSourceFile: null, workspace: createWorkspace(name) };
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

type DispatchResult<Body> = {
  body: Body | null;
  headers: Record<string, OutgoingHttpHeader>;
  statusCode: number;
};

function createRequest({
  body = "",
  headers = {},
  method,
  url,
}: RequestOptions): IncomingMessage {
  const request = Readable.from(body ? [Buffer.from(body)] : []);

  return Object.assign(request, { headers, method, url }) as IncomingMessage;
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
): Promise<DispatchResult<Body>> {
  const response = createResponse();

  await handler(
    createRequest(requestOptions),
    response as unknown as ServerResponse,
  );

  return {
    body: response.body ? JSON.parse(response.body) as Body : null,
    headers: response.headers,
    statusCode: response.statusCode,
  };
}

async function withHandler<Result>(
  testFn: (
    handler: WorkspaceApiRequestHandler,
    rootDir: string,
  ) => Promise<Result>,
  { allowedOrigins }: { allowedOrigins?: readonly string[] } = {},
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-api-catalog-"));

  try {
    const catalog = new LocalRepositoryCatalog(rootDir);
    const handler = createWorkspaceApiRequestHandler({
      allowedOrigins,
      catalog,
    });

    return await testFn(handler, rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

function snapshotUrl(repositoryId: string) {
  return `/api/repositories/${encodeURIComponent(repositoryId)}/snapshot`;
}

async function createRepository(
  handler: WorkspaceApiRequestHandler,
  repositoryId: string,
  content = createContent(),
) {
  return dispatch<RepositoryDescriptorDto>(handler, {
    body: JSON.stringify({ content, id: repositoryId }),
    method: "POST",
    url: "/api/repositories",
  });
}

async function loadSnapshot(
  handler: WorkspaceApiRequestHandler,
  repositoryId: string,
) {
  const response = await dispatch(handler, {
    method: "GET",
    url: snapshotUrl(repositoryId),
  });

  expect(response.statusCode).toBe(200);
  return parseWorkspaceRepositorySnapshot(response.body);
}

async function commitSnapshot(
  handler: WorkspaceApiRequestHandler,
  repositoryId: string,
  content: WorkspaceRepositoryContentDto,
  baseRevision: string,
) {
  const result = await dispatch<WorkspaceRepositoryCommitResultDto>(handler, {
    body: JSON.stringify({ ...content, baseRevision }),
    method: "PUT",
    url: snapshotUrl(repositoryId),
  });

  if (result.body === null) {
    throw new Error("Expected repository commit response body");
  }

  return { ...result, body: result.body };
}

describe("workspace API request handler", () => {
  it("lists, creates, and opens repositories by id", async () => {
    await withHandler(async (handler, rootDir) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/health" }),
      ).resolves.toMatchObject({ body: { ok: true }, statusCode: 200 });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/repositories" }),
      ).resolves.toEqual({
        body: { repositories: [] },
        headers: expect.any(Object),
        statusCode: 200,
      });

      const created = await createRepository(
        handler,
        "primary",
        createContent("主仓库"),
      );

      expect(created).toMatchObject({
        body: {
          adapter: "local",
          id: "primary",
          label: "主仓库",
          repositoryPath: path.join(rootDir, "primary"),
        },
        statusCode: 201,
      });
      await expect(loadSnapshot(handler, "primary")).resolves.toMatchObject({
        repositoryPath: path.join(rootDir, "primary"),
        workspace: createWorkspace("主仓库"),
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/repositories" }),
      ).resolves.toMatchObject({
        body: { repositories: [created.body] },
        statusCode: 200,
      });
    });
  });

  it("keeps repository snapshots isolated and rejects stale commits", async () => {
    await withHandler(async (handler) => {
      await createRepository(handler, "first", createContent("First"));
      await createRepository(handler, "second", createContent("Second"));
      const firstSnapshot = await loadSnapshot(handler, "first");
      const firstContent = createContent("First changed");
      const committed = await commitSnapshot(
        handler,
        "first",
        firstContent,
        firstSnapshot.revision,
      );
      const stale = await commitSnapshot(
        handler,
        "first",
        createContent("Stale"),
        firstSnapshot.revision,
      );

      expect(committed.statusCode).toBe(200);
      expect(stale).toMatchObject({
        body: {
          currentRevision: committed.body.revision,
          error: "Repository content changed outside the current session",
        },
        statusCode: 409,
      });
      await expect(loadSnapshot(handler, "first")).resolves.toMatchObject({
        workspace: createWorkspace("First changed"),
      });
      await expect(loadSnapshot(handler, "second")).resolves.toMatchObject({
        workspace: createWorkspace("Second"),
      });
    });
  });

  it("allows configured browser origins and rejects other origins", async () => {
    const allowedOrigin = "http://127.0.0.1:5173";

    await withHandler(async (handler) => {
      await createRepository(handler, "primary");
      await expect(
        dispatch(handler, {
          headers: { origin: allowedOrigin },
          method: "OPTIONS",
          url: snapshotUrl("primary"),
        }),
      ).resolves.toMatchObject({
        body: null,
        headers: {
          "access-control-allow-methods": "GET, OPTIONS, POST, PUT",
          "access-control-allow-origin": allowedOrigin,
          vary: "Origin",
        },
        statusCode: 204,
      });

      const initialSnapshot = await loadSnapshot(handler, "primary");
      await expect(
        dispatch(handler, {
          body: JSON.stringify({
            baseRevision: initialSnapshot.revision,
            ...createContent("不应写入"),
          }),
          headers: { origin: "https://example.com" },
          method: "PUT",
          url: snapshotUrl("primary"),
        }),
      ).resolves.toMatchObject({
        body: { error: "Origin is not allowed" },
        statusCode: 403,
      });
      await expect(loadSnapshot(handler, "primary")).resolves.toEqual(
        initialSnapshot,
      );
    }, { allowedOrigins: [allowedOrigin] });
  });

  it("parses an explicit origin allowlist", () => {
    expect(
      parseWorkspaceApiAllowedOrigins(
        "http://localhost:4173/, https://notes.example.test, http://localhost:4173",
      ),
    ).toEqual([
      "http://localhost:4173",
      "https://notes.example.test",
    ]);
  });

  it("rejects invalid repository and snapshot content", async () => {
    await withHandler(async (handler, rootDir) => {
      expect(
        await createRepository(handler, "../escape"),
      ).toMatchObject({
        body: { error: expect.stringContaining("invalid repository id") },
        statusCode: 400,
      });
      await createRepository(handler, "primary");
      const initialSnapshot = await loadSnapshot(handler, "primary");
      const workspace: RepositoryWorkspaceDto = {
        ...createWorkspace(),
        notes: [
          {
            createdAt: "2026-05-25T00:00:00.000Z",
            id: "note-valid",
            source: "有效笔记",
            title: "有效笔记",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
        tree: [
          { id: "tree-note-valid", kind: "note", noteId: "note-valid" },
        ],
      };
      const validCommit = await commitSnapshot(
        handler,
        "primary",
        { syntaxSourceFile: null, workspace },
        initialSnapshot.revision,
      );
      const invalidTitle = await commitSnapshot(
        handler,
        "primary",
        {
          syntaxSourceFile: null,
          workspace: {
            ...workspace,
            notes: workspace.notes.map((note) => ({
              ...note,
              title: "标题与原文不一致",
            })),
          },
        },
        validCommit.body.revision,
      );

      expect(invalidTitle).toMatchObject({
        body: { error: expect.stringContaining("does not match first line") },
        statusCode: 400,
      });
      await expect(loadSnapshot(handler, "primary")).resolves.toEqual({
        repositoryPath: path.join(rootDir, "primary"),
        revision: validCommit.body.revision,
        syntaxSourceFile: null,
        workspace,
      });
    });
  });

  it("classifies malformed requests, unknown ids, and removed routes", async () => {
    await withHandler(async (handler) => {
      await createRepository(handler, "primary");

      await expect(
        dispatch(handler, {
          body: "{",
          method: "PUT",
          url: snapshotUrl("primary"),
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is invalid JSON" },
        statusCode: 400,
      });
      await expect(
        dispatch(handler, {
          body: "x".repeat(20 * 1024 * 1024 + 1),
          method: "PUT",
          url: snapshotUrl("primary"),
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is too large" },
        statusCode: 413,
      });
      await expect(
        dispatch(handler, {
          method: "DELETE",
          url: snapshotUrl("primary"),
        }),
      ).resolves.toMatchObject({
        body: { error: "Method not allowed" },
        headers: { allow: "GET, PUT" },
        statusCode: 405,
      });
      await expect(
        dispatch(handler, { method: "GET", url: snapshotUrl("missing") }),
      ).resolves.toMatchObject({
        body: { error: "Repository does not exist: missing" },
        statusCode: 404,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/repository-snapshot" }),
      ).resolves.toMatchObject({
        body: { error: "Not found" },
        statusCode: 404,
      });
    });
  });
});
