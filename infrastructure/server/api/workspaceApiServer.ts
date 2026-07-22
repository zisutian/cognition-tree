// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import http from "node:http";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../contracts/workspace/contractValue.ts";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../contracts/workspace/json.ts";
import {
  parseCreateRepository,
  parseRepositoryDeletionMode,
  parseRenameRepository,
} from "../../../contracts/workspace/parseCatalog.ts";
import type {
  RepositoryApiErrorCodeDto,
  RepositoryApiErrorDto,
} from "../../../contracts/workspace/types.ts";
import {
  RepositoryAdapterError,
  WorkspaceRevisionConflictError,
} from "../repository/repositoryStore.ts";
import type {
  BuiltInCatalogDto,
  BuiltInIdDto,
  BuiltInRetryResultDto,
} from "../../../contracts/built-ins/types.ts";
import {
  VersionedContentRevisionConflictError,
  type VersionedContentStore,
} from "../repository/versionedContentStore.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../repository/repositoryCatalog.ts";
import { WorkspacePayloadValidationError } from "../repository/workspaceRepositoryLayout.ts";
import {
  authorizeWorkspaceApiRequest,
  WorkspaceApiSecurityError,
  type WorkspaceApiSecurityPolicy,
} from "./workspaceApiSecurity.ts";

const allowedMethods = "DELETE, GET, OPTIONS, PATCH, POST, PUT";
const maxBodyBytes = 20 * 1024 * 1024;

const statusByCode: Record<RepositoryApiErrorCodeDto, number> = {
  adapter_unavailable: 503,
  insufficient_storage: 507,
  internal_error: 500,
  invalid_request: 400,
  repository_busy: 423,
  repository_corrupt: 500,
  repository_not_found: 404,
  revision_conflict: 409,
  unauthorized: 401,
  unsupported_repository_version: 409,
};

type WorkspaceApiRoute =
  | { kind: "health"; methods: readonly string[] }
  | { kind: "repositories"; methods: readonly string[] }
  | { kind: "built-ins"; methods: readonly string[] }
  | {
      id: BuiltInIdDto;
      kind: "built-in-retry";
      methods: readonly string[];
    }
  | {
      id: BuiltInIdDto;
      kind: "built-in-snapshot";
      methods: readonly string[];
    }
  | {
      kind: "repository";
      methods: readonly string[];
      repositoryId: string;
    }
  | {
      kind: "repository-snapshot";
      methods: readonly string[];
      repositoryId: string;
    };

export type WorkspaceApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type WorkspaceApiOptions = {
  builtInCatalog?: {
    getStore(id: unknown): Promise<VersionedContentStore<unknown>>;
    listBuiltIns(): Promise<BuiltInCatalogDto>;
    retry(id: unknown): Promise<BuiltInRetryResultDto>;
  };
  catalog: WorkspaceRepositoryCatalog;
  logger?: Pick<Console, "error">;
  security: WorkspaceApiSecurityPolicy;
};

class WorkspaceApiRequestError extends Error {
  code: RepositoryApiErrorCodeDto;
  currentRevision?: RepositoryApiErrorDto["currentRevision"];
  statusCode: number;

  constructor(
    code: RepositoryApiErrorCodeDto,
    message: string,
    statusCode = statusByCode[code],
    currentRevision?: RepositoryApiErrorDto["currentRevision"],
  ) {
    super(message);
    this.name = "WorkspaceApiRequestError";
    this.code = code;
    this.currentRevision = currentRevision;
    this.statusCode = statusCode;
  }
}

function resolveRoute(pathname: string): WorkspaceApiRoute | null {
  if (pathname === "/api/health") {
    return { kind: "health", methods: ["GET"] };
  }
  if (pathname === "/api/repositories") {
    return { kind: "repositories", methods: ["GET", "POST"] };
  }
  if (pathname === "/api/built-ins") {
    return { kind: "built-ins", methods: ["GET"] };
  }
  const builtInSnapshotMatch = /^\/api\/(journal|todo)\/snapshot$/.exec(pathname);
  if (builtInSnapshotMatch) {
    return {
      id: builtInSnapshotMatch[1] as BuiltInIdDto,
      kind: "built-in-snapshot",
      methods: ["GET", "PUT"],
    };
  }
  const builtInRetryMatch = /^\/api\/(journal|todo)\/retry$/.exec(pathname);
  if (builtInRetryMatch) {
    return {
      id: builtInRetryMatch[1] as BuiltInIdDto,
      kind: "built-in-retry",
      methods: ["POST"],
    };
  }

  const match = /^\/api\/repositories\/([^/]+)\/snapshot$/.exec(pathname);

  if (match) {
    try {
      return {
        kind: "repository-snapshot",
        methods: ["GET", "PUT"],
        repositoryId: decodeURIComponent(match[1] ?? ""),
      };
    } catch {
      throw new WorkspaceApiRequestError("invalid_request", "Invalid repository id encoding");
    }
  }
  const repositoryMatch = /^\/api\/repositories\/([^/]+)$/.exec(pathname);

  if (repositoryMatch) {
    try {
      return {
        kind: "repository",
        methods: ["DELETE", "PATCH"],
        repositoryId: decodeURIComponent(repositoryMatch[1] ?? ""),
      };
    } catch {
      throw new WorkspaceApiRequestError("invalid_request", "Invalid repository id encoding");
    }
  }
  return null;
}

function getRequestHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function createResponseHeaders(origin: string | null, requestId: string): OutgoingHttpHeaders {
  return {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": allowedMethods,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Request-Id": requestId,
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(serializeJsonIteratively(body));
}

function sendNoContent(response: ServerResponse, headers: OutgoingHttpHeaders) {
  response.writeHead(204, headers);
  response.end();
}

function sendError(
  response: ServerResponse,
  error: WorkspaceApiRequestError,
  requestId: string,
  headers: OutgoingHttpHeaders,
) {
  const body: RepositoryApiErrorDto = {
    code: error.code,
    ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
    message: error.message,
    requestId,
  };

  sendJson(response, error.statusCode, body, headers);
}

function assertRequestHasNoBody(request: IncomingMessage) {
  const contentLength = getRequestHeader(request, "content-length");
  const transferEncoding = getRequestHeader(request, "transfer-encoding");

  if ((contentLength && contentLength !== "0") || transferEncoding) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Request body is not allowed for this method",
    );
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = getRequestHeader(request, "content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Content-Type must be application/json",
      415,
    );
  }

  const contentLength = getRequestHeader(request, "content-length");

  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new WorkspaceApiRequestError("invalid_request", "Content-Length is invalid");
  }
  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new WorkspaceApiRequestError("invalid_request", "Request body is too large", 413);
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new WorkspaceApiRequestError("invalid_request", "Request body is too large", 413);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    throw new WorkspaceApiRequestError("invalid_request", "Request body is empty");
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new WorkspaceApiRequestError("invalid_request", "Request body is invalid JSON");
    }
    throw error;
  }
}

function mapRepositoryError(error: unknown): WorkspaceApiRequestError {
  if (error instanceof WorkspaceApiRequestError) {
    return error;
  }
  if (error instanceof WorkspaceRevisionConflictError) {
    return new WorkspaceApiRequestError(
      "revision_conflict",
      "Repository content changed outside the current session",
      409,
      error.currentRevision,
    );
  }
  if (error instanceof VersionedContentRevisionConflictError) {
    return new WorkspaceApiRequestError(
      "revision_conflict",
      "Versioned content changed outside the current session",
      409,
      error.currentRevision,
    );
  }
  if (error instanceof UnsupportedRepositoryVersionError) {
    return new WorkspaceApiRequestError(
      "unsupported_repository_version",
      "Repository version is not supported",
    );
  }
  if (error instanceof UnsupportedWireVersionError) {
    return new WorkspaceApiRequestError(
      "unsupported_repository_version",
      "Content version is not supported",
    );
  }
  if (error instanceof RepositoryAdapterError) {
    const message = error.code === "repository_corrupt"
      ? "Repository data is corrupt"
      : error.code === "internal_error"
        ? "Internal server error"
        : error.message;

    return new WorkspaceApiRequestError(error.code, message, error.statusCode);
  }
  if (error instanceof RepositoryCatalogError) {
    const message = error.code === "repository_corrupt"
      ? "Repository data is corrupt"
      : error.code === "internal_error"
        ? "Internal server error"
        : error.message;

    return new WorkspaceApiRequestError(error.code, message);
  }
  if (
    error instanceof WorkspaceRepositoryContractError ||
    error instanceof WireContractError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    return new WorkspaceApiRequestError("invalid_request", error.message);
  }
  if (error instanceof Error && "code" in error &&
      (error.code === "ENOSPC" || error.code === "EDQUOT")) {
    return new WorkspaceApiRequestError("insufficient_storage", "Repository storage is full");
  }
  return new WorkspaceApiRequestError("internal_error", "Internal server error");
}

function redactLogText(source: string, sensitiveValues: readonly string[]) {
  const withoutKnownSecrets = sensitiveValues
    .filter((value) => value.length > 0)
    .reduce(
      (current, value) => current.split(value).join("[redacted]"),
      source,
    );
  const repositoryId = String.raw`repository-[a-z0-9]+(?:-[a-z0-9]+)*`;
  const quotedRepositoryPath = new RegExp(
    String.raw`([\"'\x60])((?:[A-Za-z]:[\\/]|/)(?:[^\"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^\"'\x60\r\n]*)?)\1`,
    "gi",
  );
  const unquotedRepositoryPath = new RegExp(
    String.raw`(?:[A-Za-z]:[\\/]|/)(?:[^\s\"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^\s\"'\x60\r\n]*)?`,
    "gi",
  );

  return withoutKnownSecrets
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(quotedRepositoryPath, "$1[repository-path]$1")
    .replace(unquotedRepositoryPath, "[repository-path]");
}

function createSafeLogError(
  error: unknown,
  sensitiveValues: readonly string[],
) {
  if (!(error instanceof Error)) {
    return new Error(redactLogText(String(error), sensitiveValues));
  }

  const safe = new Error(redactLogText(error.message, sensitiveValues));

  safe.name = error.name;
  if (error.stack) {
    safe.stack = redactLogText(error.stack, sensitiveValues);
  }
  return safe;
}

export function createWorkspaceApiRequestHandler({
  builtInCatalog,
  catalog,
  logger = console,
  security,
}: WorkspaceApiOptions): WorkspaceApiRequestHandler {
  return async (request, response) => {
    const requestId = randomUUID();
    const sensitiveLogValues: string[] = [];
    let responseHeaders = createResponseHeaders(null, requestId);

    try {
      const { allowedOrigin } = authorizeWorkspaceApiRequest(request, security);

      responseHeaders = createResponseHeaders(allowedOrigin, requestId);
      const url = new URL(request.url ?? "/", "http://localhost");
      const route = resolveRoute(url.pathname);

      if (!route) {
        throw new WorkspaceApiRequestError("invalid_request", "Not found", 404);
      }
      if (request.method === "OPTIONS") {
        sendNoContent(response, responseHeaders);
        return;
      }
      if (!request.method || !route.methods.includes(request.method)) {
        throw new WorkspaceApiRequestError("invalid_request", "Method not allowed", 405);
      }
      if (request.method === "GET" || request.method === "DELETE") {
        assertRequestHasNoBody(request);
      }
      if (route.kind === "built-in-retry") {
        assertRequestHasNoBody(request);
      }

      if (route.kind !== "repository" && url.search !== "") {
        throw new WorkspaceApiRequestError(
          "invalid_request",
          "Query parameters are not allowed for this route",
        );
      }

      if (route.kind === "health") {
        sendJson(response, 200, { ok: true }, responseHeaders);
        return;
      }
      if (route.kind === "repositories") {
        if (request.method === "GET") {
          sendJson(response, 200, await catalog.listRepositories(), responseHeaders);
          return;
        }

        const body = parseCreateRepository(await readJsonBody(request));

        if (
          body.adapter === "webdav" &&
          body.authentication.type === "basic"
        ) {
          sensitiveLogValues.push(body.authentication.password);
        }

        sendJson(response, 201, await catalog.createRepository(body), responseHeaders);
        return;
      }
      if (route.kind === "built-ins") {
        if (!builtInCatalog) {
          throw new WorkspaceApiRequestError(
            "adapter_unavailable",
            "Built-in data catalog is unavailable",
          );
        }
        sendJson(
          response,
          200,
          await builtInCatalog.listBuiltIns(),
          responseHeaders,
        );
        return;
      }
      if (route.kind === "built-in-retry") {
        if (!builtInCatalog) {
          throw new WorkspaceApiRequestError(
            "adapter_unavailable",
            "Built-in data catalog is unavailable",
          );
        }
        sendJson(
          response,
          200,
          await builtInCatalog.retry(route.id),
          responseHeaders,
        );
        return;
      }
      if (route.kind === "built-in-snapshot") {
        if (!builtInCatalog) {
          throw new WorkspaceApiRequestError(
            "adapter_unavailable",
            "Built-in data catalog is unavailable",
          );
        }
        const store = await builtInCatalog.getStore(route.id);
        if (request.method === "GET") {
          sendJson(response, 200, await store.loadSnapshot(), responseHeaders);
        } else {
          sendJson(
            response,
            200,
            await store.commitSnapshot(await readJsonBody(request)),
            responseHeaders,
          );
        }
        return;
      }
      if (route.kind === "repository") {
        if (request.method === "PATCH") {
          if (url.search !== "") {
            throw new WorkspaceApiRequestError(
              "invalid_request",
              "Query parameters are not allowed for repository rename",
            );
          }
          sendJson(
            response,
            200,
            await catalog.renameRepository(
              route.repositoryId,
              parseRenameRepository(await readJsonBody(request)),
            ),
            responseHeaders,
          );
          return;
        }
        const keys = [...url.searchParams.keys()];
        const modes = url.searchParams.getAll("mode");

        if (
          keys.length !== 1 ||
          keys[0] !== "mode" ||
          modes.length !== 1
        ) {
          throw new WorkspaceApiRequestError(
            "invalid_request",
            "DELETE requires exactly one mode query parameter",
          );
        }
        const result = await catalog.deleteRepository(
          route.repositoryId,
          parseRepositoryDeletionMode(modes[0]),
        );

        sendJson(
          response,
          result.status === "deleting" ? 202 : 200,
          result,
          responseHeaders,
        );
        return;
      }

      const store = await catalog.getStore(route.repositoryId);

      if (request.method === "GET") {
        sendJson(response, 200, await store.loadSnapshot(), responseHeaders);
      } else {
        sendJson(
          response,
          200,
          await store.commitSnapshot(await readJsonBody(request)),
          responseHeaders,
        );
      }
    } catch (error) {
      if (error instanceof WorkspaceApiSecurityError && error.allowedOrigin) {
        responseHeaders = createResponseHeaders(error.allowedOrigin, requestId);
      }

      const mapped = error instanceof WorkspaceApiSecurityError
        ? new WorkspaceApiRequestError(
            error.statusCode === 401 || error.statusCode === 403
              ? "unauthorized"
              : "invalid_request",
            error.message,
            error.statusCode,
          )
        : mapRepositoryError(error);

      if (mapped.statusCode >= 500) {
        logger.error(
          `[${requestId}] workspace API request failed`,
          createSafeLogError(error, sensitiveLogValues),
        );
      }
      if (mapped.code === "unauthorized" && mapped.statusCode === 401) {
        responseHeaders = { ...responseHeaders, "WWW-Authenticate": "Bearer" };
      }
      if (mapped.statusCode === 405) {
        responseHeaders = { ...responseHeaders, Allow: allowedMethods };
      }
      sendError(response, mapped, requestId, responseHeaders);
    }
  };
}

export function createWorkspaceApiServer(options: WorkspaceApiOptions) {
  const server = http.createServer(createWorkspaceApiRequestHandler(options));

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
