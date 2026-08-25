// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { isLoopbackAddress } from "../network/loopbackAddress.ts";
import type { BootstrapConfigurationStore } from "./bootstrapConfigurationStore.ts";

const recoveryHtml = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>认知树恢复设置</title>
<main><h1>认知树需要恢复服务设置</h1><p>内容和智能体尚未加载。请选择继续使用的数据根；留空会恢复为项目内的 .cognition-tree。</p>
<form id="recovery"><label>数据根 <input id="dataRoot" placeholder="留空使用项目默认位置"></label><button>保存并重启</button></form><p id="result" role="status"></p></main>
<script>document.querySelector('#recovery').addEventListener('submit',async event=>{event.preventDefault();const result=document.querySelector('#result');result.textContent='正在保存……';const dataRoot=document.querySelector('#dataRoot').value.trim();const response=await fetch('/api/v3/recovery/system-configuration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataRoot:dataRoot||null})});const body=await response.json();result.textContent=response.ok?'设置已保存，服务正在重启……':body.message||'恢复失败';});</script></html>`;

function hostIsLoopback(request: IncomingMessage) {
  const host = request.headers.host;

  if (!host) return false;
  try {
    return isLoopbackAddress(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readRecoveryBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.byteLength;
    if (size > 16_384) throw new Error("Recovery request is too large");
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;

  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !("dataRoot" in value) ||
      ((value as { dataRoot: unknown }).dataRoot !== null &&
        typeof (value as { dataRoot: unknown }).dataRoot !== "string")) {
    throw new Error("Recovery request is invalid");
  }
  return (value as { dataRoot: string | null }).dataRoot;
}

export async function runBootstrapRecoveryServer({
  bootstrap,
  failure,
}: {
  bootstrap: BootstrapConfigurationStore;
  failure: unknown;
}) {
  const server = http.createServer((request, response) => {
    void (async () => {
      if (!isLoopbackAddress(request.socket.remoteAddress) || !hostIsLoopback(request)) {
        sendJson(response, 403, { message: "Recovery is restricted to this machine" });
        return;
      }
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        });
        response.end(recoveryHtml);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/v3/recovery/status") {
        sendJson(response, 200, {
          message: failure instanceof Error ? failure.message : "Bootstrap configuration is unavailable",
          recovery: true,
        });
        return;
      }
      if (request.method === "POST" &&
          url.pathname === "/api/v3/recovery/system-configuration") {
        try {
          await bootstrap.recover(await readRecoveryBody(request));
          response.once("finish", () => {
            process.exitCode = 75;
            server.close();
          });
          sendJson(response, 200, { restarting: true });
        } catch (error) {
          sendJson(response, 422, {
            message: error instanceof Error ? error.message : "Recovery failed",
          });
        }
        return;
      }
      sendJson(response, 404, { message: "Recovery operation does not exist" });
    })().catch((error: unknown) => {
      sendJson(response, 500, {
        message: error instanceof Error ? error.message : "Recovery failed",
      });
    });
  });

  const stop = () => server.close();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  server.listen(3_001, "127.0.0.1");
  await once(server, "listening");
  console.error("Cognition Tree bootstrap configuration is unavailable.");
  console.error("Recovery settings: http://127.0.0.1:3001");
  await once(server, "close");
}
