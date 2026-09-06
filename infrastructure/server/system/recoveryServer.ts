// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { SystemConfigurationValidationError } from "../../../application/system/systemConfiguration.ts";
import { isLoopbackAddress } from "../network/loopbackAddress.ts";
import type { BootstrapConfigurationStore } from "./bootstrapConfigurationStore.ts";
import {
  recoveryPageHtml,
  recoveryPageScript,
  recoveryPageStylesheet,
} from "./recoveryPage.ts";
import {
  readRecoveryRequestDataRoot,
  RecoveryRequestAbortedError,
  RecoveryRequestError,
} from "./recoveryRequest.ts";

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
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function sendPageAsset(
  response: ServerResponse,
  contentType: string,
  body: string,
  contentSecurityPolicy?: string,
) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    ...(contentSecurityPolicy
      ? { "Content-Security-Policy": contentSecurityPolicy }
      : {}),
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(body);
}

function sendUnexpectedRecoveryFailure(
  response: ServerResponse,
  error: unknown,
) {
  console.error("Cognition Tree recovery failed.", error);
  if (response.headersSent || response.destroyed || response.writableEnded) {
    if (!response.destroyed) response.destroy();
    return;
  }
  sendJson(response, 500, { message: "Recovery failed" });
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
        sendPageAsset(
          response,
          "text/html; charset=utf-8",
          recoveryPageHtml,
          "default-src 'none'; script-src 'self'; style-src 'self'; " +
            "connect-src 'self'; form-action 'self'; base-uri 'none'; " +
            "frame-ancestors 'none'",
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/recovery.js") {
        sendPageAsset(
          response,
          "text/javascript; charset=utf-8",
          recoveryPageScript,
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/recovery.css") {
        sendPageAsset(
          response,
          "text/css; charset=utf-8",
          recoveryPageStylesheet,
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/v4/recovery/status") {
        sendJson(response, 200, {
          message: failure instanceof Error ? failure.message : "Bootstrap configuration is unavailable",
          recovery: true,
        });
        return;
      }
      if (request.method === "POST" &&
          url.pathname === "/api/v4/recovery/system-configuration") {
        try {
          await bootstrap.recover(await readRecoveryRequestDataRoot(request));
          response.once("finish", () => {
            process.exitCode = 75;
            server.close();
          });
          sendJson(response, 200, { restarting: true });
        } catch (error) {
          if (error instanceof RecoveryRequestAbortedError) {
            if (!response.destroyed) response.destroy();
            return;
          }
          if (error instanceof RecoveryRequestError) {
            sendJson(response, error.statusCode, { message: error.message });
            return;
          }
          if (error instanceof SystemConfigurationValidationError) {
            sendJson(response, 422, { message: error.message });
            return;
          }
          sendUnexpectedRecoveryFailure(response, error);
        }
        return;
      }
      sendJson(response, 404, { message: "Recovery operation does not exist" });
    })().catch((error: unknown) =>
      sendUnexpectedRecoveryFailure(response, error)
    );
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
