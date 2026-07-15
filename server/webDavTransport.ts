// SPDX-License-Identifier: GPL-3.0-or-later

export type WebDavTextResource = {
  etag: string | null;
  source: string;
};

export type WebDavWriteConditions = {
  ifMatch?: string;
  ifNoneMatch?: "*";
};

export type WebDavTransport = {
  createCollection: (relativePath: string) => Promise<void>;
  move: (sourcePath: string, destinationPath: string) => Promise<boolean>;
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

export type WebDavTransportOptions = {
  fetch?: typeof fetch;
  password?: string;
  url: string;
  username?: string;
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
  url.pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  return url;
}

function encodeRelativePath(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid WebDAV repository path: ${relativePath}`);
  }

  return segments.map(encodeURIComponent).join("/");
}

function getEtag(response: Response) {
  return response.headers.get("etag");
}

export function createWebDavTransport({
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  password,
  url,
  username,
}: WebDavTransportOptions): WebDavTransport {
  if ((username === undefined) !== (password === undefined)) {
    throw new Error("WebDAV username and password must be configured together");
  }

  const baseUrl = normalizeBaseUrl(url);
  const authorization = username === undefined
    ? null
    : `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  const resolveUrl = (relativePath: string) =>
    new URL(encodeRelativePath(relativePath), baseUrl).toString();
  const request = async (
    method: string,
    relativePath: string,
    init: RequestInit = {},
  ) => {
    const headers = new Headers(init.headers);

    if (authorization) {
      headers.set("Authorization", authorization);
    }

    return fetchFn(resolveUrl(relativePath), { ...init, headers, method });
  };
  const assertStatus = (
    response: Response,
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

      assertStatus(response, "MKCOL", relativePath, [200, 201, 204, 405]);
    },
    async move(sourcePath, destinationPath) {
      const response = await request("MOVE", sourcePath, {
        headers: {
          Destination: resolveUrl(destinationPath),
          Overwrite: "T",
        },
      });

      if (response.status === 404) {
        return false;
      }

      assertStatus(response, "MOVE", sourcePath, [200, 201, 204]);
      return true;
    },
    async readText(relativePath) {
      const response = await request("GET", relativePath);

      if (response.status === 404) {
        return null;
      }

      assertStatus(response, "GET", relativePath, [200]);
      return { etag: getEtag(response), source: await response.text() };
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

      const response = await request("PUT", relativePath, {
        body: source,
        headers,
      });

      assertStatus(response, "PUT", relativePath, [200, 201, 204]);
      return getEtag(response);
    },
  };
}
