// SPDX-License-Identifier: GPL-3.0-or-later

import type { ViteDevServer } from "vite";
import type { ClientRuntime } from "./clientRuntime.ts";

export function createDevelopmentClientRuntime(
  vite: ViteDevServer,
): ClientRuntime {
  let connectionsClosing: Promise<void> | null = null;
  let disposing: Promise<void> | null = null;

  return {
    closeLongLivedConnections() {
      connectionsClosing ??= Promise.resolve().then(() => vite.ws.close());
      return connectionsClosing;
    },
    dispose() {
      disposing ??= Promise.resolve().then(() => vite.close());
      return disposing;
    },
    handle: (request, response) =>
      new Promise<void>((resolve, reject) => {
        vite.middlewares(request, response, (error: unknown) => {
          if (error) {
            reject(error);
            return;
          }
          if (!response.headersSent) {
            response.writeHead(404, {
              "Content-Type": "text/plain; charset=utf-8",
            });
            response.end("Not found");
          }
          resolve();
        });
        response.once("finish", resolve);
        response.once("close", resolve);
      }),
  };
}
