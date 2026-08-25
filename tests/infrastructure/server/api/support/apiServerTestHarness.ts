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
import { expect } from "vitest";
import { createInitialRepositoryContent } from "../../../../../application/workspace/session/initialRepository.ts";
import {
  prepareWorkspaceRepositoryContent,
} from "../../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import type {
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../../contracts/workspace/types.ts";
import { LocalRepositoryCatalog } from
  "../../../../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";
import {
  createApiRequestHandler,
  type ApiRequestHandler,
} from "../../../../../infrastructure/server/api/http/server.ts";
import type { ApiRuntime } from "../../../../../infrastructure/server/api/http/runtime.ts";
import {
  createApiSecurityPolicy,
} from "../../../../../infrastructure/server/api/http/security.ts";
import { AutomationTokenStore } from "../../../../../infrastructure/server/access/automationTokenStore.ts";
import { BuiltInCatalog } from "../../../../../infrastructure/server/repository/built-ins/catalog.ts";

type RequestOptions = {
  body?: unknown;
  headers?: IncomingHttpHeaders;
  method: string;
  token?: string;
  url: string;
};

export type TestServerResponse = {
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

export async function dispatchRaw(
  handler: ApiRequestHandler,
  options: RequestOptions,
) {
  const response = createResponse();

  await handler(
    createRequest(options),
    response as unknown as ServerResponse,
  );
  return response;
}

export async function dispatch<Body>(
  handler: ApiRequestHandler,
  options: RequestOptions,
) {
  const response = await dispatchRaw(handler, options);

  return {
    body: response.body ? JSON.parse(response.body) as Body : null,
    headers: response.headers,
    statusCode: response.statusCode,
  };
}

export function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function createContent(): WorkspaceRepositoryContentDto {
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

export function createRuntime(): ApiRuntime {
  let nextId = 1_000;

  return {
    createId: () => uuid(nextId++),
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    timezoneOffsetMinutes: () => 480,
    today: () => "2026-07-29",
  };
}

export async function withHandler(
  run: (
    handler: ApiRequestHandler,
    rootDir: string,
    createAuthenticatedHandler: (
      ownerToken: string,
    ) => ApiRequestHandler,
  ) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-api-v3-"));
  let nextRepositoryId = 1;
  const catalog = new LocalRepositoryCatalog(rootDir, {
    createId: () => uuid(nextRepositoryId++),
  });
  const builtInCatalog = new BuiltInCatalog(rootDir);
  const runtime = createRuntime();
  const stateDirectory = path.join(rootDir, "server-state");
  const createHandler = (
    ownerToken?: string,
  ) => {
    const accessStore = new AutomationTokenStore(stateDirectory, {
      now: runtime.now,
    });

    return (
    createApiRequestHandler({
      accessStore,
      builtInCatalog,
      catalog,
      runtime,
      security: createApiSecurityPolicy({
        ...(ownerToken ? { bearerToken: ownerToken } : {}),
        host: "127.0.0.1",
      }),
      stateDirectory,
    })
    );
  };

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

export async function createRepository(handler: ApiRequestHandler) {
  const response = await dispatch<RepositoryDescriptorDto>(handler, {
    body: {
      content: createContent(),
      label: "API 仓库",
    },
    method: "POST",
    url: "/api/v3/admin/repositories",
  });

  expect(response.statusCode).toBe(201);
  return response.body!;
}

export const revision = (character: string) =>
  `sha256:${character.repeat(64)}` as `sha256:${string}`;

export function preparedWorkspaceSnapshot(
  content: WorkspaceRepositoryContentDto,
  contentRevision: `sha256:${string}`,
) {
  return {
    content,
    projection: prepareWorkspaceRepositoryContent(content),
    revision: contentRevision,
  };
}
