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

function createWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
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

const customSyntaxSource = `name = "自定义语法"
tabDisplayWidth = 4

[concept]
type = "concept"
label = "顶格概念"
tone = "teal"
textColor = "cyan"

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
textColor = "amber"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "全局概念引用"
tone = "blue"
textColor = "cyan"
`;

describe("workspace API request handler", () => {
  it("serves repository info and workspace read/write endpoints", async () => {
    await withHandler(async (handler, rootDir) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/health" }),
      ).resolves.toMatchObject({
        body: { ok: true },
        statusCode: 200,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/repository" }),
      ).resolves.toMatchObject({
        body: { path: rootDir },
        statusCode: 200,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: createWorkspace(),
        statusCode: 200,
      });

      const workspace = createWorkspace();
      await expect(
        dispatch(handler, {
          body: JSON.stringify(workspace),
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 204,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: workspace,
        statusCode: 200,
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
          url: "/api/workspace",
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

      await expect(
        dispatch(handler, {
          headers: { origin: allowedOrigin },
          method: "GET",
          url: "/api/health",
        }),
      ).resolves.toMatchObject({
        body: { ok: true },
        headers: { "access-control-allow-origin": allowedOrigin },
        statusCode: 200,
      });

      await expect(
        dispatch(handler, {
          body: JSON.stringify({
            ...createWorkspace(),
            name: "不应写入",
          }),
          headers: { origin: "https://example.com" },
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: { error: "Origin is not allowed" },
        statusCode: 403,
      });

      await expect(
        dispatch(handler, { method: "GET", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: createWorkspace(),
        statusCode: 200,
      });
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

  it("serves the workspace syntax endpoint", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/syntax" }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 200,
      });

      await expect(
        dispatch(handler, {
          body: JSON.stringify({ source: customSyntaxSource }),
          method: "PUT",
          url: "/api/syntax",
        }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 204,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/syntax" }),
      ).resolves.toMatchObject({
        body: {
          fileName: "workspace.toml",
          source: customSyntaxSource,
        },
        statusCode: 200,
      });
    });
  });

  it("rejects invalid workspace payloads without changing the stored workspace", async () => {
    await withHandler(async (handler) => {
      const workspace = createWorkspace();

      workspace.notes = [
        {
          id: "note-valid",
          title: "有效笔记",
          source: "有效笔记",
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:00.000Z",
        },
      ];
      workspace.tree = [
        {
          id: "tree-note-valid",
          kind: "note",
          noteId: "note-valid",
        },
      ];

      await expect(
        dispatch(handler, {
          body: JSON.stringify(workspace),
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 204,
      });

      await expect(
        dispatch(handler, {
          body: JSON.stringify({
            ...workspace,
            activeNoteId: "note-missing",
          }),
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: {
          error: expect.stringContaining("unsupported field"),
        },
        statusCode: 400,
      });

      await expect(
        dispatch(handler, {
          body: JSON.stringify({
            ...workspace,
            notes: workspace.notes.map((note) => ({
              ...note,
              title: "标题与原文不一致",
            })),
          }),
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: {
          error: expect.stringContaining("does not match first line"),
        },
        statusCode: 400,
      });

      await expect(
        dispatch(handler, { method: "GET", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: workspace,
        statusCode: 200,
      });
    });
  });

  it("classifies request and routing errors", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch(handler, {
          body: "{",
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is invalid JSON" },
        statusCode: 400,
      });

      await expect(
        dispatch(handler, {
          body: JSON.stringify({ source: "" }),
          method: "PUT",
          url: "/api/syntax",
        }),
      ).resolves.toMatchObject({
        body: { error: "Syntax profile source is required" },
        statusCode: 400,
      });

      await expect(
        dispatch(handler, {
          body: "x".repeat(20 * 1024 * 1024 + 1),
          method: "PUT",
          url: "/api/workspace",
        }),
      ).resolves.toMatchObject({
        body: { error: "Request body is too large" },
        statusCode: 413,
      });

      await expect(
        dispatch(handler, { method: "DELETE", url: "/api/workspace" }),
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
