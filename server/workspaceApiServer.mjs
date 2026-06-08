// SPDX-License-Identifier: GPL-3.0-or-later

import http from "node:http";
import { WorkspaceFileStore } from "./workspaceFileStore.mjs";

const jsonHeaders = {
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, PUT",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body));
}

function sendNoContent(response) {
  response.writeHead(204, jsonHeaders);
  response.end();
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  const maxBodyBytes = 20 * 1024 * 1024;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBodyBytes) {
      throw new Error("Request body is too large");
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    throw new Error("Request body is empty");
  }

  return JSON.parse(body);
}

export function createWorkspaceApiRequestHandler({ store }) {
  return async (request, response) => {
    try {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.setHeader("Access-Control-Allow-Methods", "DELETE, GET, OPTIONS, PUT");

      if (request.method === "OPTIONS") {
        sendNoContent(response);
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/repository" && request.method === "GET") {
        sendJson(response, 200, { path: store.repositoryPath });
        return;
      }

      if (url.pathname === "/api/workspace" && request.method === "GET") {
        sendJson(response, 200, await store.loadWorkspace());
        return;
      }

      if (url.pathname === "/api/workspace" && request.method === "PUT") {
        await store.saveWorkspace(await readJsonBody(request));
        sendNoContent(response);
        return;
      }

      if (url.pathname === "/api/workspace" && request.method === "DELETE") {
        await store.clearWorkspace();
        sendNoContent(response);
        return;
      }

      if (url.pathname === "/api/syntax" && request.method === "GET") {
        sendJson(response, 200, await store.listSyntaxFiles());
        return;
      }

      if (url.pathname.startsWith("/api/syntax/")) {
        const fileName = decodeURIComponent(
          url.pathname.slice("/api/syntax/".length),
        );

        if (request.method === "GET") {
          sendJson(response, 200, await store.readSyntaxFile(fileName));
          return;
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);

          if (typeof body.source !== "string") {
            throw new Error("Syntax profile source is required");
          }

          await store.saveSyntaxFile(fileName, body.source);
          sendNoContent(response);
          return;
        }

        if (request.method === "DELETE") {
          await store.deleteSyntaxFile(fileName);
          sendNoContent(response);
          return;
        }
      }

      sendError(response, 404, "Not found");
    } catch (error) {
      sendError(response, 500, error instanceof Error ? error.message : "Unknown error");
    }
  };
}

export function createWorkspaceApiServer({ store }) {
  return http.createServer(createWorkspaceApiRequestHandler({ store }));
}

export { WorkspaceFileStore };
