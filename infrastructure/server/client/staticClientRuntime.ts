// SPDX-License-Identifier: GPL-3.0-or-later

import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendText(response: ServerResponse, statusCode: number, message: string) {
  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(message),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

async function resolveStaticFile(
  rootDirectory: string,
  pathname: string,
): Promise<string | null> {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const relativePath = decoded === "/" ? "index.html" : decoded.slice(1);
  const candidate = path.resolve(rootDirectory, relativePath);
  const boundary = `${rootDirectory}${path.sep}`;

  if (candidate !== rootDirectory && !candidate.startsWith(boundary)) {
    return null;
  }
  const metadata = await stat(candidate).catch(() => null);

  if (!metadata?.isFile()) return null;
  const canonical = await realpath(candidate);

  return canonical.startsWith(boundary) ? canonical : null;
}

export type StaticClientRuntime = {
  dispose(): Promise<void>;
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
};

export async function createStaticClientRuntime(
  requestedRootDirectory: string,
): Promise<StaticClientRuntime> {
  const rootDirectory = await realpath(requestedRootDirectory);
  const indexPath = await resolveStaticFile(rootDirectory, "/");

  if (!indexPath) {
    throw new Error("Client build is missing index.html");
  }
  return {
    async dispose() {},
    async handle(request, response) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }
      let pathname: string;

      try {
        pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        sendText(response, 400, "Invalid request URL");
        return;
      }
      const requestedFile = await resolveStaticFile(rootDirectory, pathname);
      const filePath = requestedFile ?? indexPath;
      const metadata = await stat(filePath);

      response.writeHead(200, {
        "Content-Length": metadata.size,
        "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ??
          "application/octet-stream",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(filePath);

        stream.once("error", reject);
        response.once("close", resolve);
        response.once("finish", resolve);
        stream.pipe(response);
      });
    },
  };
}
