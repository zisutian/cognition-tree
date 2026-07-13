// SPDX-License-Identifier: GPL-3.0-or-later

import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceApiRequestHandler,
  parseWorkspaceApiAllowedOrigins,
  WorkspaceFileStore,
} from "../../server/workspaceApiServer.mjs";

function createWorkspace(name = "本地笔记库") {
  return {
    id: "local-workspace",
    name,
    notes: [],
    tree: [],
  };
}

function createRequest({ body = "", headers = {}, method, url }) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);

  request.headers = headers;
  request.method = method;
  request.url = url;

  return request;
}

function createResponse() {
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
        this.setHeader(name, value);
      });
    },
    end(chunk = "") {
      this.body += chunk;
    },
  };
}

async function dispatch(handler, requestOptions) {
  const response = createResponse();

  await handler(createRequest(requestOptions), response);

  return {
    body: response.body ? JSON.parse(response.body) : null,
    headers: response.headers,
    statusCode: response.statusCode,
  };
}

async function withHandler(testFn, { allowedOrigins } = {}) {
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

async function loadSnapshot(handler) {
  const response = await dispatch(handler, {
    method: "GET",
    url: "/api/repository-snapshot",
  });

  expect(response.statusCode).toBe(200);
  return response.body;
}

async function commitSnapshot(handler, content, baseRevision) {
  return dispatch(handler, {
    body: JSON.stringify({ ...content, baseRevision }),
    method: "PUT",
    url: "/api/repository-snapshot",
  });
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
  it("serves repository metadata and commits aggregate snapshots", async () => {
    await withHandler(async (handler, rootDir) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/health" }),
      ).resolves.toMatchObject({ body: { ok: true }, statusCode: 200 });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/repository" }),
      ).resolves.toMatchObject({
        body: { path: rootDir },
        statusCode: 200,
      });

      const initialSnapshot = await loadSnapshot(handler);

      expect(initialSnapshot).toMatchObject({
        syntaxSourceFile: null,
        workspace: createWorkspace(),
      });
      expect(initialSnapshot.revision).toEqual(expect.any(String));

      const content = {
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
        revision: commit.body.revision,
      });
    });
  });

  it("rejects stale commits without overwriting the current snapshot", async () => {
    await withHandler(async (handler) => {
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
    await withHandler(async (handler) => {
      const initialSnapshot = await loadSnapshot(handler);
      const workspace = {
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
        body: { error: expect.stringContaining("Unsupported") },
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
        revision: validCommit.body.revision,
        syntaxSourceFile: null,
        workspace,
      });
    });
  });

  it("classifies malformed requests and removed routes", async () => {
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
        body: { error: expect.stringContaining("Missing") },
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

      for (const url of ["/api/workspace", "/api/syntax", "/api/missing"]) {
        await expect(
          dispatch(handler, { method: "GET", url }),
        ).resolves.toMatchObject({
          body: { error: "Not found" },
          statusCode: 404,
        });
      }
    });
  });
});
