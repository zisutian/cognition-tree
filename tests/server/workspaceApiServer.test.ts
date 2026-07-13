// SPDX-License-Identifier: GPL-3.0-or-later

import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { describe, expect, it } from "vitest";
import { parseWorkspaceRepositorySnapshot } from "../../contracts/workspace-repository/parseRepository";
import type {
  RepositoryWorkspaceDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types";
import {
  createWorkspaceApiRequestHandler,
  parseWorkspaceApiAllowedOrigins,
  type WorkspaceApiRequestHandler,
} from "../../server/workspaceApiServer.ts";
import { WorkspaceFileStore } from "../../server/workspaceFileStore.ts";

function createWorkspace(name = "本地笔记库") {
  return {
    id: "local-workspace",
    name,
    notes: [],
    tree: [],
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
  const response: TestServerResponse = {
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

  return response;
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
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-api-"));

  try {
    const handler = createWorkspaceApiRequestHandler({
      allowedOrigins,
      store: new WorkspaceFileStore(rootDir),
    });

    return await testFn(handler, rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function loadSnapshot(handler: WorkspaceApiRequestHandler) {
  const response = await dispatch(handler, {
    method: "GET",
    url: "/api/repository-snapshot",
  });

  expect(response.statusCode).toBe(200);
  return parseWorkspaceRepositorySnapshot(response.body);
}

async function commitSnapshot(
  handler: WorkspaceApiRequestHandler,
  content: WorkspaceRepositoryContentDto,
  baseRevision: string,
) {
  const result = await dispatch<WorkspaceRepositoryCommitResultDto>(handler, {
    body: JSON.stringify({ ...content, baseRevision }),
    method: "PUT",
    url: "/api/repository-snapshot",
  });

  if (result.body === null) {
    throw new Error("Expected repository commit response body");
  }

  return { ...result, body: result.body };
}

const customSyntaxSource = `name = "自定义语法"
tabDisplayWidth = 4

[concept]
type = "concept"
label = "顶格概念"
tone = "teal"
textColor = "cyan"
`;

describe("workspace API request handler", () => {
  it("serves and commits aggregate repository snapshots", async () => {
    await withHandler(async (handler, rootDir) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/health" }),
      ).resolves.toMatchObject({ body: { ok: true }, statusCode: 200 });
      const initialSnapshot = await loadSnapshot(handler);

      expect(initialSnapshot).toMatchObject({
        repositoryPath: rootDir,
        syntaxSourceFile: null,
        workspace: createWorkspace(),
      });
      expect(initialSnapshot.revision).toEqual(expect.any(String));

      const content: WorkspaceRepositoryContentDto = {
        syntaxSourceFile: {
          fileName: "workspace.toml",
          source: customSyntaxSource,
        },
        workspace: createWorkspace("聚合仓库"),
      };
      const commit = await commitSnapshot(
        handler,
        content,
        initialSnapshot.revision,
      );

      expect(commit).toMatchObject({
        body: { revision: expect.any(String) },
        statusCode: 200,
      });
      expect(commit.body.revision).not.toBe(initialSnapshot.revision);
      await expect(loadSnapshot(handler)).resolves.toEqual({
        ...content,
        repositoryPath: rootDir,
        revision: commit.body.revision,
      });
    });
  });

  it("rejects stale commits without overwriting the current snapshot", async () => {
    await withHandler(async (handler, rootDir) => {
      const initialSnapshot = await loadSnapshot(handler);
      const currentContent = {
        syntaxSourceFile: null,
        workspace: createWorkspace("current"),
      };
      const firstCommit = await commitSnapshot(
        handler,
        currentContent,
        initialSnapshot.revision,
      );
      const staleCommit = await commitSnapshot(
        handler,
        {
          syntaxSourceFile: null,
          workspace: createWorkspace("stale overwrite"),
        },
        initialSnapshot.revision,
      );

      expect(staleCommit).toEqual(expect.objectContaining({
        body: {
          currentRevision: firstCommit.body.revision,
          error: "Repository content changed outside the current session",
        },
        statusCode: 409,
      }));
      await expect(loadSnapshot(handler)).resolves.toEqual({
        ...currentContent,
        repositoryPath: rootDir,
        revision: firstCommit.body.revision,
      });
    });
  });

  it("allows configured browser origins and rejects other origins", async () => {
    const allowedOrigin = "http://127.0.0.1:5173";

    await withHandler(async (handler) => {
      await expect(
        dispatch(handler, {
          headers: { origin: allowedOrigin },
          method: "OPTIONS",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: null,
        headers: {
          "access-control-allow-methods": "GET, OPTIONS, PUT",
          "access-control-allow-origin": allowedOrigin,
          vary: "Origin",
        },
        statusCode: 204,
      });

      const initialSnapshot = await loadSnapshot(handler);
      await expect(
        dispatch(handler, {
          body: JSON.stringify({
            baseRevision: initialSnapshot.revision,
            syntaxSourceFile: null,
            workspace: createWorkspace("不应写入"),
          }),
          headers: { origin: "https://example.com" },
          method: "PUT",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: { error: "Origin is not allowed" },
        statusCode: 403,
      });
      await expect(loadSnapshot(handler)).resolves.toEqual(initialSnapshot);
    });
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

  it("rejects invalid commit content without changing the repository", async () => {
    await withHandler(async (handler, rootDir) => {
      const initialSnapshot = await loadSnapshot(handler);
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
          {
            id: "tree-note-valid",
            kind: "note",
            noteId: "note-valid",
          },
        ],
      };
      const validCommit = await commitSnapshot(
        handler,
        { syntaxSourceFile: null, workspace },
        initialSnapshot.revision,
      );

      const unsupportedField = await dispatch(handler, {
        body: JSON.stringify({
          baseRevision: validCommit.body.revision,
          extra: true,
          syntaxSourceFile: null,
          workspace,
        }),
        method: "PUT",
        url: "/api/repository-snapshot",
      });
      expect(unsupportedField).toMatchObject({
        body: { error: expect.stringContaining("unsupported") },
        statusCode: 400,
      });

      const invalidTitle = await commitSnapshot(
        handler,
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
      await expect(loadSnapshot(handler)).resolves.toEqual({
        repositoryPath: rootDir,
        revision: validCommit.body.revision,
        syntaxSourceFile: null,
        workspace,
      });
    });
  });

  it("classifies malformed requests and routing errors", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch(handler, {
          body: "{",
          method: "PUT",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is invalid JSON" },
        statusCode: 400,
      });
      await expect(
        dispatch(handler, {
          body: JSON.stringify({ baseRevision: "revision" }),
          method: "PUT",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: { error: expect.stringContaining("missing") },
        statusCode: 400,
      });
      await expect(
        dispatch(handler, {
          body: "x".repeat(20 * 1024 * 1024 + 1),
          method: "PUT",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is too large" },
        statusCode: 413,
      });
      await expect(
        dispatch(handler, {
          method: "DELETE",
          url: "/api/repository-snapshot",
        }),
      ).resolves.toMatchObject({
        body: { error: "Method not allowed" },
        headers: { allow: "GET, PUT" },
        statusCode: 405,
      });

      await expect(
        dispatch(handler, { method: "GET", url: "/api/missing" }),
      ).resolves.toMatchObject({
        body: { error: "Not found" },
        statusCode: 404,
      });
    });
  });
});
