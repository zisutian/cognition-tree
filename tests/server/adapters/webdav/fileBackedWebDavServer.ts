// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

type RequestPause = {
  method: string;
  path: string;
  reached: () => void;
  waitForRelease: Promise<void>;
};

export type PausedWebDavRequest = {
  reached: Promise<void>;
  release: () => void;
};

const repositoryUrlPath = "/repository/";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;

    request.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > 32 * 1024 * 1024) {
        reject(new Error("WebDAV live fixture request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function createFileEtag(filePath: string) {
  const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");

  return `"sha256-${digest}"`;
}

function respond(response: ServerResponse, status: number, body = "") {
  response.statusCode = status;
  response.end(body);
}

/**
 * Minimal filesystem-backed WebDAV server used only by the opt-in live suite.
 * Requests cross a real loopback TCP socket and every resource is persisted to
 * disk. The fixture intentionally implements only the methods required by the
 * repository adapter instead of acting as an in-process WebDavTransport mock.
 */
export class FileBackedWebDavServer {
  readonly rootPath: string;
  #pauses: RequestPause[] = [];
  #requestCounts = new Map<string, number>();
  #server: Server | null = null;
  #url: string | null = null;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    mkdirSync(rootPath, { recursive: true });
  }

  get url() {
    if (!this.#url) {
      throw new Error("WebDAV live fixture is not listening");
    }
    return this.#url;
  }

  async start(port = 0) {
    if (this.#server) {
      throw new Error("WebDAV live fixture is already listening");
    }
    const server = createServer((request, response) => {
      void this.#handleRequest(request, response).catch(() => {
        if (!response.headersSent) {
          response.statusCode = 500;
        }
        response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
    const address = server.address() as AddressInfo;

    this.#server = server;
    this.#url = `http://127.0.0.1:${address.port}${repositoryUrlPath}`;
    return address.port;
  }

  async stop() {
    const server = this.#server;

    this.#server = null;
    this.#url = null;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }

  pauseNextRequest(method: string, relativePath: string): PausedWebDavRequest {
    let markReached!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { markReached = resolve; });
    const waitForRelease = new Promise<void>((resolve) => { release = resolve; });

    this.#pauses.push({
      method: method.toUpperCase(),
      path: relativePath,
      reached: markReached,
      waitForRelease,
    });
    return { reached, release };
  }

  countRequests(method: string, relativePath: string) {
    return this.#requestCounts.get(`${method.toUpperCase()} ${relativePath}`) ?? 0;
  }

  resetRequestCounts() {
    this.#requestCounts.clear();
  }

  #decodeRelativePath(request: IncomingMessage) {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (!requestUrl.pathname.startsWith(repositoryUrlPath)) {
      return null;
    }
    const encoded = requestUrl.pathname.slice(repositoryUrlPath.length).replace(/\/$/, "");
    let decoded: string;

    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      return null;
    }
    const segments = decoded.split("/").filter(Boolean);

    if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
      return null;
    }
    return segments.join("/");
  }

  #resolve(relativePath: string) {
    const resolved = path.resolve(this.rootPath, ...relativePath.split("/").filter(Boolean));

    if (resolved !== this.rootPath && !resolved.startsWith(`${this.rootPath}${path.sep}`)) {
      throw new Error("WebDAV live fixture path escaped its root");
    }
    return resolved;
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse) {
    const method = (request.method ?? "GET").toUpperCase();
    const relativePath = this.#decodeRelativePath(request);

    if (relativePath === null) {
      respond(response, 400);
      return;
    }
    const requestKey = `${method} ${relativePath}`;

    this.#requestCounts.set(requestKey, (this.#requestCounts.get(requestKey) ?? 0) + 1);
    const pauseIndex = this.#pauses.findIndex(
      (candidate) => candidate.method === method && candidate.path === relativePath,
    );

    if (pauseIndex >= 0) {
      const [pause] = this.#pauses.splice(pauseIndex, 1);

      if (pause) {
        pause.reached();
        await pause.waitForRelease;
      }
    }

    switch (method) {
      case "GET":
        this.#handleGet(relativePath, response);
        return;
      case "PUT":
        this.#handlePut(relativePath, request, response, await readRequestBody(request));
        return;
      case "DELETE":
        this.#handleDelete(relativePath, request, response);
        return;
      case "MKCOL":
        this.#handleMkcol(relativePath, response);
        return;
      case "PROPFIND":
        this.#handlePropfind(relativePath, response);
        return;
      default:
        response.setHeader("Allow", "GET, PUT, DELETE, MKCOL, PROPFIND");
        respond(response, 405);
    }
  }

  #handleGet(relativePath: string, response: ServerResponse) {
    const filePath = this.#resolve(relativePath);

    if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
      respond(response, 404);
      return;
    }
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("ETag", createFileEtag(filePath));
    response.setHeader("Last-Modified", statSync(filePath).mtime.toUTCString());
    respond(response, 200, readFileSync(filePath, "utf8"));
  }

  #handlePut(
    relativePath: string,
    request: IncomingMessage,
    response: ServerResponse,
    body: Buffer,
  ) {
    if (!relativePath) {
      respond(response, 405);
      return;
    }
    const filePath = this.#resolve(relativePath);
    const parentPath = path.dirname(filePath);
    const exists = existsSync(filePath);

    if (!existsSync(parentPath) || !lstatSync(parentPath).isDirectory()) {
      respond(response, 409);
      return;
    }
    if (exists && lstatSync(filePath).isDirectory()) {
      respond(response, 405);
      return;
    }
    const currentEtag = exists ? createFileEtag(filePath) : null;
    const ifMatch = request.headers["if-match"];
    const ifNoneMatch = request.headers["if-none-match"];

    if ((ifNoneMatch === "*" && exists) || (ifMatch !== undefined && ifMatch !== currentEtag)) {
      respond(response, 412);
      return;
    }
    const temporaryPath = path.join(parentPath, `.webdav-write-${randomUUID()}`);

    writeFileSync(temporaryPath, body);
    renameSync(temporaryPath, filePath);
    response.setHeader("ETag", createFileEtag(filePath));
    respond(response, exists ? 204 : 201);
  }

  #handleDelete(relativePath: string, request: IncomingMessage, response: ServerResponse) {
    if (!relativePath) {
      respond(response, 405);
      return;
    }
    const filePath = this.#resolve(relativePath);

    if (!existsSync(filePath)) {
      respond(response, 404);
      return;
    }
    const ifMatch = request.headers["if-match"];

    if (ifMatch !== undefined &&
        (!lstatSync(filePath).isFile() || ifMatch !== createFileEtag(filePath))) {
      respond(response, 412);
      return;
    }
    rmSync(filePath, { force: true, recursive: true });
    respond(response, 204);
  }

  #handleMkcol(relativePath: string, response: ServerResponse) {
    if (!relativePath) {
      respond(response, 405);
      return;
    }
    const directoryPath = this.#resolve(relativePath);

    if (existsSync(directoryPath)) {
      respond(response, 405);
      return;
    }
    if (!existsSync(path.dirname(directoryPath))) {
      respond(response, 409);
      return;
    }
    mkdirSync(directoryPath);
    respond(response, 201);
  }

  #handlePropfind(relativePath: string, response: ServerResponse) {
    const directoryPath = this.#resolve(relativePath);

    if (!existsSync(directoryPath) || !lstatSync(directoryPath).isDirectory()) {
      respond(response, 404);
      return;
    }
    const entries = [
      { filePath: directoryPath, relativePath },
      ...readdirSync(directoryPath).map((name) => ({
        filePath: path.join(directoryPath, name),
        relativePath: relativePath ? `${relativePath}/${name}` : name,
      })),
    ];
    const responses = entries.map((entry) => {
      const stats = statSync(entry.filePath);
      const encodedPath = entry.relativePath
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
      const suffix = stats.isDirectory() ? "/" : "";
      const href = `${repositoryUrlPath}${encodedPath}${suffix}`;
      const resourceType = stats.isDirectory() ? "<d:collection/>" : "";

      return [
        "<d:response>",
        `<d:href>${xmlEscape(href)}</d:href>`,
        "<d:propstat><d:prop>",
        `<d:getlastmodified>${stats.mtime.toUTCString()}</d:getlastmodified>`,
        `<d:resourcetype>${resourceType}</d:resourcetype>`,
        "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>",
        "</d:response>",
      ].join("");
    }).join("");

    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    respond(
      response,
      207,
      `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`,
    );
  }
}
