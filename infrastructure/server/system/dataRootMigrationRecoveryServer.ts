// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { ApiRequestError } from "../api/protocol/index.ts";
import { buildApiOperationPath, getApiOperation, parseApiOperationRequest, assertApiOperationResponse } from "../../../contracts/api/index.ts";
import { once } from "node:events";
import http from "node:http";
import type { DataRootMigrationCoordinator } from "../../../application/system/index.ts";
import {
  isLocalRecoveryRequest,
  readJsonRequestBody,
} from "../network/index.ts";

const statusPath = buildApiOperationPath("getMigrationRecoveryStatus");
const reconcilePath = buildApiOperationPath("reconcileMigrationRecovery");
const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>数据根迁移恢复</title><body><main><h1>数据根迁移需要恢复</h1><p>源目录与目标目录均已保留，内容服务尚未开放。请处理下方显示的文件或权限问题，再重新对账。</p><pre id="status"></pre><button id="reconcile">重新对账</button><p id="message"></p></main><script src="/recovery.js"></script></body></html>`;
const script = `const status = document.getElementById('status'); const button = document.getElementById('reconcile'); const message = document.getElementById('message'); async function load() { const response = await fetch('${statusPath}'); status.textContent = JSON.stringify(await response.json(), null, 2); } button.onclick = async () => { button.disabled = true; try { const response = await fetch('${reconcilePath}', { method: 'POST', headers: {'Content-Type':'application/json'}, body:'{}' }); const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Recovery request failed'); message.textContent = result.restarting ? '已确认数据目录，服务正在重新启动。' : '尚未确认，请继续处理显示的问题。'; await load(); } catch(error) { message.textContent = String(error); } finally { button.disabled = false; } }; load().catch(error => { message.textContent = String(error); });`;

export function createDataRootMigrationRecoveryHandler({ migrations, failure, requestRestart }: {
  migrations: Pick<DataRootMigrationCoordinator, "current" | "recoverOnStartup">;
  failure: unknown;
  requestRestart(): void;
}) {
  let errorMessage = failure instanceof Error ? failure.message : null;
  let recovering = false;
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    const requestId = randomUUID();
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(body));
    };
    const fail = (error: ApiRequestError) => send(error.statusCode, error.toDto(requestId));
    void (async () => {
      const host = new URL(`http://${request.headers.host ?? "invalid"}`);
      if (!isLocalRecoveryRequest(request)) {
        fail(new ApiRequestError("forbidden", "Recovery is restricted to this machine")); return;
      }
      const url = new URL(request.url ?? "/", host);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/recovery.js")) {
        response.writeHead(200, {
          "Content-Type": url.pathname === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8",
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        });
        response.end(url.pathname === "/" ? page : script); return;
      }
      if (request.method === "GET" && url.pathname === statusPath) {
        const migration = await migrations.current().catch((error: unknown) => {
          errorMessage = error instanceof Error ? error.message : "Migration record is unavailable";
          return null;
        });
        const result = { errorMessage, migration };
        assertApiOperationResponse(getApiOperation("getMigrationRecoveryStatus"), 200, result);
        send(200, result); return;
      }
      if (request.method === "POST" && url.pathname === reconcilePath) {
        const operation = getApiOperation("reconcileMigrationRecovery");
        try {
          const body = await readJsonRequestBody(request, operation.maximumBodyBytes!);
          parseApiOperationRequest(operation, body);
        } catch { fail(new ApiRequestError("invalid_request", "Expected an empty JSON recovery request")); return; }
        if (recovering) { fail(new ApiRequestError("repository_busy", "Recovery is already running")); return; }
        recovering = true;
        try {
          const status = await migrations.recoverOnStartup();
          const restarting = status === null || status.status === "completed" || status.status === "failed";
          if (restarting) response.once("finish", requestRestart);
          const result = { restarting, migration: status };
          assertApiOperationResponse(operation, 200, result);
          send(200, result);
        } finally { recovering = false; }
        return;
      }
      fail(new ApiRequestError("not_found", "Recovery operation does not exist"));
    })().catch((error: unknown) => {
      errorMessage = error instanceof Error ? error.message : "Migration recovery failed";
      if (!response.headersSent) fail(new ApiRequestError("adapter_unavailable", errorMessage));
      else response.destroy();
    });
  };
}

export async function runDataRootMigrationRecoveryServer({ migrations, failure, port = 3001 }: {
  migrations: Pick<DataRootMigrationCoordinator, "current" | "recoverOnStartup">;
  failure: unknown;
  port?: number;
}) {
  const server = http.createServer(createDataRootMigrationRecoveryHandler({
    migrations, failure, requestRestart: () => { process.exitCode = 75; server.close(); },
  }));
  const stop = () => server.close();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    console.error(`Data-root migration recovery: http://127.0.0.1:${port}`);
    await once(server, "close");
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
  }
}
