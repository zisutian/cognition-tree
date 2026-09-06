// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { ApiRequestError } from "../api/protocol/index.ts";
import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import { once } from "node:events";
import http, { type ServerResponse } from "node:http";
import { SystemConfigurationValidationError } from "../../../application/system/index.ts";
import { isLocalRecoveryRequest } from "../network/index.ts";
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
  sendJson(response, 500, new ApiRequestError("internal_error", "Recovery failed").toDto(randomUUID()));
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
      if (!isLocalRecoveryRequest(request)) {
        sendJson(response, 403, new ApiRequestError("forbidden", "Recovery is restricted to this machine").toDto(randomUUID()));
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
      if (request.method === "GET" && url.pathname === buildApiOperationPath("getBootstrapRecoveryStatus")) {
        sendJson(response, 200, {
          message: failure instanceof Error ? failure.message : "Bootstrap configuration is unavailable",
          recovery: true,
        });
        return;
      }
      if (request.method === "POST" &&
          url.pathname === buildApiOperationPath("recoverBootstrapConfiguration")) {
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
            sendJson(response, error.statusCode, new ApiRequestError("invalid_request", error.message).toDto(randomUUID()));
            return;
          }
          if (error instanceof SystemConfigurationValidationError) {
            sendJson(response, 422, new ApiRequestError("invalid_request", error.message).toDto(randomUUID()));
            return;
          }
          sendUnexpectedRecoveryFailure(response, error);
        }
        return;
      }
      sendJson(response, 404, new ApiRequestError("not_found", "Recovery operation does not exist").toDto(randomUUID()));
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
