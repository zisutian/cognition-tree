// SPDX-License-Identifier: GPL-3.0-or-later

import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import { parseWebDavCollectionMultistatus } from "./webDavMultistatusCodec.ts";
import {
  createWebDavResourceUrl,
  normalizeWebDavBaseUrl,
} from "./webDavPathCodec.ts";
import {
  parseWebDavPrivateTargets,
  resolveWebDavTarget,
  type WebDavDnsLookup,
  type WebDavPrivateTargetPolicy,
} from "./webDavTargetPolicy.ts";
import {
  WebDavRequestError,
  type WebDavTransport,
} from "./webDavTransport.ts";

export type WebDavHttpClientOptions = {
  fetch?: typeof fetch;
  lookup?: WebDavDnsLookup;
  maxResponseBytes?: number;
  password?: string;
  privateTargetPolicy?: WebDavPrivateTargetPolicy;
  requestTimeoutMs?: number;
  url: string;
  username?: string;
};

type BufferedWebDavResponse = {
  headers: Headers;
  source: string;
  status: number;
};

export function createWebDavHttpClient({
  fetch: fetchFn,
  lookup,
  maxResponseBytes = 20 * 1024 * 1024,
  password,
  privateTargetPolicy = parseWebDavPrivateTargets(undefined),
  requestTimeoutMs = 30_000,
  url,
  username,
}: WebDavHttpClientOptions): WebDavTransport {
  if ((username === undefined) !== (password === undefined)) {
    throw new Error("WebDAV username and password must be configured together");
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new Error("WebDAV response limit must be a positive integer");
  }
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error("WebDAV request timeout must be a positive integer");
  }

  const baseUrl = normalizeWebDavBaseUrl(url);

  if (username !== undefined && baseUrl.protocol !== "https:") {
    throw new Error("Authenticated WebDAV repositories require HTTPS");
  }

  const authorization = username === undefined
    ? null
    : `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  const readFetchResponse = async (
    response: Response,
    controller: AbortController,
    method: string,
    relativePath: string,
  ) => {
    const contentLength = response.headers.get("content-length");

    if (contentLength && Number(contentLength) > maxResponseBytes) {
      controller.abort();
      throw new WebDavRequestError(method, relativePath, 413);
    }
    if (!response.body) return "";

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;

    while (true) {
      const result = await reader.read();

      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maxResponseBytes) {
        controller.abort();
        throw new WebDavRequestError(method, relativePath, 413);
      }
      chunks.push(result.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
      "utf8",
    );
  };
  const createHeaders = (headers: IncomingHttpHeaders) => {
    const result = new Headers();

    Object.entries(headers).forEach(([name, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => result.append(name, entry));
      } else if (value !== undefined) {
        result.set(name, value);
      }
    });
    return result;
  };
  const requestDirect = async (
    method: string,
    requestUrl: URL,
    headers: Headers,
    body: BodyInit | null | undefined,
    controller: AbortController,
    relativePath: string,
  ): Promise<BufferedWebDavResponse> => {
    let removeAbortListener = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(
        new WebDavRequestError(method, relativePath, 408),
      );

      if (controller.signal.aborted) {
        abort();
        return;
      }
      controller.signal.addEventListener("abort", abort, { once: true });
      removeAbortListener = () => {
        controller.signal.removeEventListener("abort", abort);
      };
    });
    const target = await Promise.race([
      resolveWebDavTarget(requestUrl, privateTargetPolicy, lookup),
      aborted,
    ]).finally(removeAbortListener);

    if (controller.signal.aborted) {
      throw new WebDavRequestError(method, relativePath, 408);
    }
    if (body !== undefined && body !== null && typeof body !== "string") {
      throw new Error("WebDAV transport only supports text request bodies");
    }

    return new Promise((resolve, reject) => {
      const requestFn = requestUrl.protocol === "https:"
        ? https.request
        : http.request;
      const directHeaders = Object.fromEntries(headers.entries());

      directHeaders.host = requestUrl.host;
      const request = requestFn({
        // Do not let Node's global keep-alive agent carry a socket across
        // requests. Every WebDAV request has just resolved and validated its
        // target address; a pooled socket would both bypass that per-request
        // connection boundary and could be reused after the remote service
        // has restarted, before the old socket's close event is observed.
        agent: false,
        family: target.family,
        headers: directHeaders,
        host: target.address,
        method,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        port: requestUrl.port || undefined,
        ...(requestUrl.protocol === "https:"
          ? {
              rejectUnauthorized: true,
              servername: requestUrl.hostname.replace(/^\[|\]$/g, ""),
            }
          : {}),
      }, (response) => {
        const chunks: Buffer[] = [];
        let byteLength = 0;
        const contentLength = Number(response.headers["content-length"] ?? 0);

        if (contentLength > maxResponseBytes) {
          response.destroy();
          reject(new WebDavRequestError(method, relativePath, 413));
          return;
        }
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

          byteLength += buffer.byteLength;
          if (byteLength > maxResponseBytes) {
            response.destroy(
              new WebDavRequestError(method, relativePath, 413),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", reject);
        response.on("end", () => resolve({
          headers: createHeaders(response.headers),
          source: Buffer.concat(chunks).toString("utf8"),
          status: response.statusCode ?? 500,
        }));
      });
      const abort = () => request.destroy(
        new WebDavRequestError(method, relativePath, 408),
      );

      controller.signal.addEventListener("abort", abort, { once: true });
      request.on("error", reject);
      request.on("close", () => {
        controller.signal.removeEventListener("abort", abort);
      });
      if (body) request.write(body);
      request.end();
    });
  };
  const request = async (
    method: string,
    relativePath: string,
    init: RequestInit = {},
    allowRoot = false,
  ) => {
    const headers = new Headers(init.headers);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    timer.unref();
    if (authorization) headers.set("Authorization", authorization);

    try {
      const requestUrl = createWebDavResourceUrl(
        baseUrl,
        relativePath,
        allowRoot,
      );

      if (!fetchFn) {
        return await requestDirect(
          method,
          requestUrl,
          headers,
          init.body,
          controller,
          relativePath,
        );
      }
      const response = await fetchFn(requestUrl, {
        ...init,
        headers,
        method,
        redirect: "error",
        signal: controller.signal,
      });

      return {
        headers: response.headers,
        source: await readFetchResponse(
          response,
          controller,
          method,
          relativePath,
        ),
        status: response.status,
      } satisfies BufferedWebDavResponse;
    } catch (error) {
      if (error instanceof WebDavRequestError) throw error;
      if (controller.signal.aborted) {
        throw new WebDavRequestError(method, relativePath, 408);
      }
      if (!fetchFn) {
        throw new WebDavRequestError(method, relativePath, 502);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const assertStatus = (
    response: BufferedWebDavResponse,
    method: string,
    relativePath: string,
    allowedStatuses: readonly number[],
  ) => {
    if (!allowedStatuses.includes(response.status)) {
      throw new WebDavRequestError(method, relativePath, response.status);
    }
  };

  return {
    async createCollection(relativePath) {
      const response = await request("MKCOL", relativePath);

      if (response.status === 405) return "already-exists";
      assertStatus(response, "MKCOL", relativePath, [200, 201, 204]);
      return "created";
    },
    async listCollection(relativePath) {
      const response = await request("PROPFIND", relativePath, {
        body:
          '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>',
        headers: {
          Depth: "1",
          "Content-Type": "application/xml; charset=utf-8",
        },
      }, relativePath === "");

      assertStatus(response, "PROPFIND", relativePath, [207]);
      return parseWebDavCollectionMultistatus(response.source, baseUrl);
    },
    async readText(relativePath) {
      const response = await request("GET", relativePath);

      if (response.status === 404) return null;
      assertStatus(response, "GET", relativePath, [200]);
      return { etag: response.headers.get("etag"), source: response.source };
    },
    async remove(relativePath, conditions = {}) {
      const headers = new Headers();

      if (conditions.ifMatch) headers.set("If-Match", conditions.ifMatch);
      const response = await request("DELETE", relativePath, { headers });

      if (response.status === 404) return false;
      assertStatus(response, "DELETE", relativePath, [200, 202, 204]);
      return true;
    },
    async writeText(relativePath, source, conditions = {}) {
      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
      });

      if (conditions.ifMatch) headers.set("If-Match", conditions.ifMatch);
      if (conditions.ifNoneMatch) {
        headers.set("If-None-Match", conditions.ifNoneMatch);
      }
      const response = await request("PUT", relativePath, {
        body: source,
        headers,
      });

      assertStatus(response, "PUT", relativePath, [200, 201, 204]);
      return response.headers.get("etag");
    },
  };
}
