// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";

export type WebDavTextResource = {
  etag: string | null;
  source: string;
};

export type WebDavCollectionEntry = {
  lastModified: number | null;
  path: string;
};

export type WebDavWriteConditions = {
  ifMatch?: string;
  ifNoneMatch?: "*";
};

export type WebDavCollectionCreationResult = "already-exists" | "created";

export type WebDavTransport = {
  createCollection: (
    relativePath: string,
  ) => Promise<WebDavCollectionCreationResult>;
  listCollection: (relativePath: string) => Promise<WebDavCollectionEntry[]>;
  readText: (relativePath: string) => Promise<WebDavTextResource | null>;
  remove: (
    relativePath: string,
    conditions?: Pick<WebDavWriteConditions, "ifMatch">,
  ) => Promise<boolean>;
  writeText: (
    relativePath: string,
    source: string,
    conditions?: WebDavWriteConditions,
  ) => Promise<string | null>;
};

export class WebDavRequestError extends Error {
  method: string;
  relativePath: string;
  statusCode: number;

  constructor(method: string, relativePath: string, statusCode: number) {
    super(`WebDAV ${method} ${relativePath} failed with ${statusCode}`);
    this.name = "WebDavRequestError";
    this.method = method;
    this.relativePath = relativePath;
    this.statusCode = statusCode;
  }
}

export class WebDavCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebDavCapabilityError";
  }
}

export type WebDavTransportOptions = {
  fetch?: typeof fetch;
  password?: string;
  requestTimeoutMs?: number;
  url: string;
  username?: string;
};

type BufferedWebDavResponse = {
  headers: Headers;
  source: string;
  status: number;
};

function normalizeBaseUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported WebDAV protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("WebDAV credentials must not be embedded in the URL");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

function encodeRelativePath(relativePath: string, allowRoot = false) {
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (allowRoot) {
      return "";
    }
    throw new Error(`Invalid WebDAV repository path: ${relativePath}`);
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid WebDAV repository path: ${relativePath}`);
  }
  return segments.map(encodeURIComponent).join("/");
}

function parseCollectionResponse(source: string, baseUrl: URL) {
  const responses = source.match(/<(?:[A-Za-z]+:)?response\b[\s\S]*?<\/(?:[A-Za-z]+:)?response>/gi) ?? [];
  const entries: WebDavCollectionEntry[] = [];

  for (const response of responses) {
    const href = /<(?:[A-Za-z]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?href>/i.exec(response)?.[1]
      ?.replace(/&amp;/g, "&").trim();

    if (!href) {
      continue;
    }

    let url: URL;

    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
      continue;
    }

    const pathValue = decodeURIComponent(url.pathname.slice(baseUrl.pathname.length)).replace(/\/$/, "");
    const modifiedSource = /<(?:[A-Za-z]+:)?getlastmodified\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?getlastmodified>/i.exec(response)?.[1]?.trim();
    const modified = modifiedSource ? Date.parse(modifiedSource) : Number.NaN;

    if (pathValue) {
      entries.push({ lastModified: Number.isFinite(modified) ? modified : null, path: pathValue });
    }
  }

  return entries;
}

export function createWebDavTransport({
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  password,
  requestTimeoutMs = 30_000,
  url,
  username,
}: WebDavTransportOptions): WebDavTransport {
  if ((username === undefined) !== (password === undefined)) {
    throw new Error("WebDAV username and password must be configured together");
  }

  const baseUrl = normalizeBaseUrl(url);

  if (username !== undefined && baseUrl.protocol !== "https:") {
    throw new Error("Authenticated WebDAV repositories require HTTPS");
  }

  const authorization = username === undefined
    ? null
    : `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  const resolveUrl = (relativePath: string, allowRoot = false) =>
    new URL(encodeRelativePath(relativePath, allowRoot), baseUrl).toString();
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
    if (authorization) {
      headers.set("Authorization", authorization);
    }

    try {
      const response = await fetchFn(resolveUrl(relativePath, allowRoot), {
        ...init,
        headers,
        method,
        signal: controller.signal,
      });

      // fetch resolves when response headers arrive. Keep the same deadline
      // active while consuming the body so a stalled WebDAV response cannot
      // hold a repository operation indefinitely.
      return {
        headers: response.headers,
        source: await response.text(),
        status: response.status,
      } satisfies BufferedWebDavResponse;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new WebDavRequestError(method, relativePath, 408);
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

      if (response.status === 405) {
        return "already-exists";
      }
      assertStatus(response, "MKCOL", relativePath, [200, 201, 204]);
      return "created";
    },
    async listCollection(relativePath) {
      const response = await request("PROPFIND", relativePath, {
        body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>',
        headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      }, relativePath === "");

      assertStatus(response, "PROPFIND", relativePath, [207]);
      return parseCollectionResponse(response.source, baseUrl);
    },
    async readText(relativePath) {
      const response = await request("GET", relativePath);

      if (response.status === 404) {
        return null;
      }
      assertStatus(response, "GET", relativePath, [200]);
      return { etag: response.headers.get("etag"), source: response.source };
    },
    async remove(relativePath, conditions = {}) {
      const headers = new Headers();

      if (conditions.ifMatch) {
        headers.set("If-Match", conditions.ifMatch);
      }
      const response = await request("DELETE", relativePath, { headers });

      if (response.status === 404) {
        return false;
      }
      assertStatus(response, "DELETE", relativePath, [200, 202, 204]);
      return true;
    },
    async writeText(relativePath, source, conditions = {}) {
      const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });

      if (conditions.ifMatch) {
        headers.set("If-Match", conditions.ifMatch);
      }
      if (conditions.ifNoneMatch) {
        headers.set("If-None-Match", conditions.ifNoneMatch);
      }
      const response = await request("PUT", relativePath, { body: source, headers });

      assertStatus(response, "PUT", relativePath, [200, 201, 204]);
      return response.headers.get("etag");
    },
  };
}

export async function probeWebDavCapabilities(transport: WebDavTransport) {
  const directory = `.ctn-capability-${randomUUID()}`;
  const resourcePath = `${directory}/probe.txt`;

  try {
    const creation = await transport.createCollection(directory);

    if (creation !== "created") {
      throw new WebDavCapabilityError("WebDAV server must support MKCOL");
    }
    const createdEtag = await transport.writeText(resourcePath, "one", { ifNoneMatch: "*" });

    if (!createdEtag) {
      throw new WebDavCapabilityError("WebDAV server must return ETag for PUT");
    }
    try {
      await transport.writeText(resourcePath, "must-not-overwrite", {
        ifNoneMatch: "*",
      });
      throw new WebDavCapabilityError("WebDAV server ignored If-None-Match");
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const resource = await transport.readText(resourcePath);

    if (!resource || resource.source !== "one" || !resource.etag) {
      throw new WebDavCapabilityError("WebDAV server must return ETag for GET");
    }
    const updatedEtag = await transport.writeText(resourcePath, "two", { ifMatch: resource.etag });

    if (!updatedEtag || updatedEtag === resource.etag) {
      throw new WebDavCapabilityError("WebDAV ETag must change after conditional PUT");
    }
    try {
      await transport.writeText(resourcePath, "must-not-overwrite", {
        ifMatch: createdEtag,
      });
      throw new WebDavCapabilityError("WebDAV server ignored stale If-Match");
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const listed = await transport.listCollection(directory);

    if (!listed.some((entry) => entry.path === resourcePath ||
      entry.path.endsWith(`/${resourcePath.split("/").at(-1) ?? ""}`))) {
      throw new WebDavCapabilityError("WebDAV PROPFIND must list collection resources");
    }
    try {
      await transport.remove(resourcePath, { ifMatch: createdEtag });
      throw new WebDavCapabilityError("WebDAV server ignored stale DELETE If-Match");
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }
    }
    const removed = await transport.remove(resourcePath, { ifMatch: updatedEtag });

    if (!removed || await transport.readText(resourcePath)) {
      throw new WebDavCapabilityError("WebDAV server ignored conditional DELETE");
    }
  } catch (error) {
    if (error instanceof WebDavCapabilityError) {
      throw error;
    }
    throw new WebDavCapabilityError("WebDAV server lacks required conditional request capabilities");
  } finally {
    await transport.remove(directory).catch(() => false);
  }
}
