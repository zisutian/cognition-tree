// SPDX-License-Identifier: GPL-3.0-or-later

import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNoteApiRequestHandler,
  NoteFileStore,
} from "../../server/noteApiServer.mjs";
import { defaultSyntaxProfile } from "../../server/syntaxProfileToml.mjs";

function createWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    defaultSyntaxProfileId: "ctn-default",
    syntaxProfiles: [defaultSyntaxProfile],
    notes: [],
    tree: [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [],
      },
    ],
  };
}

function createRequest({ body = "", method, url }) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);

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

async function withHandler(testFn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-api-"));

  try {
    const handler = createNoteApiRequestHandler({
      store: new NoteFileStore(rootDir),
    });

    return await testFn(handler, rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("note API request handler", () => {
  it("serves repository info and workspace CRUD endpoints", async () => {
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

      await expect(
        dispatch(handler, { method: "DELETE", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 204,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/workspace" }),
      ).resolves.toMatchObject({
        body: createWorkspace(),
        statusCode: 200,
      });
    });
  });

  it("serves syntax profile file endpoints", async () => {
    await withHandler(async (handler) => {
      await expect(
        dispatch(handler, { method: "GET", url: "/api/syntax" }),
      ).resolves.toMatchObject({
        body: [
          {
            fileName: "ctn-default.toml",
            profile: defaultSyntaxProfile,
          },
        ],
        statusCode: 200,
      });

      const source = `id = "ctn-custom"
name = "自定义语法"
version = 1
spaceIndentUnit = 4

[[markers]]
marker = "!"
type = "component"
label = "风险"
`;

      await expect(
        dispatch(handler, {
          body: JSON.stringify({ source }),
          method: "PUT",
          url: "/api/syntax/custom.toml",
        }),
      ).resolves.toMatchObject({
        body: null,
        statusCode: 204,
      });
      await expect(
        dispatch(handler, { method: "GET", url: "/api/syntax/custom.toml" }),
      ).resolves.toMatchObject({
        body: {
          fileName: "custom.toml",
          profile: {
            id: "ctn-custom",
            version: 1,
          },
          source,
        },
        statusCode: 200,
      });
    });
  });
});
