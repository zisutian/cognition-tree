// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer } from "node:http";
import type { ViteDevServer } from "vite";
import { describe, expect, it, vi } from "vitest";
import { closeApiServer } from
  "../../../../infrastructure/server/api/http/serverLifecycle.ts";
import { createDevelopmentClientRuntime } from
  "../../../../infrastructure/server/client/index.ts";

function createVite(closeSocket: () => Promise<void>, close: () => Promise<void>) {
  return {
    close: vi.fn(close),
    ws: { close: vi.fn(closeSocket) },
  } as unknown as ViteDevServer;
}

describe("development client runtime", () => {
  it("shares repeated connection and resource closing", async () => {
    let releaseSocket!: () => void;
    const socketClosed = new Promise<void>((resolve) => { releaseSocket = resolve; });
    const vite = createVite(() => socketClosed, async () => undefined);
    const runtime = createDevelopmentClientRuntime(vite);
    const firstClose = runtime.closeLongLivedConnections();

    expect(runtime.closeLongLivedConnections()).toBe(firstClose);
    await Promise.resolve();
    expect(vite.ws.close).toHaveBeenCalledTimes(1);
    releaseSocket();
    await firstClose;
    const firstDispose = runtime.dispose();

    expect(runtime.dispose()).toBe(firstDispose);
    await firstDispose;
    expect(vite.close).toHaveBeenCalledTimes(1);
  });

  it("releases Vite resources even when WebSocket closing fails", async () => {
    const socketError = new Error("socket close failed");
    const vite = createVite(async () => { throw socketError; }, async () => undefined);
    const runtime = createDevelopmentClientRuntime(vite);
    const server = createServer((_request, response) => response.end());

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    await expect(closeApiServer({
      closeLongLivedConnections: () => runtime.closeLongLivedConnections(),
      closeOwnedResources: () => runtime.dispose(),
      server,
    })).rejects.toBe(socketError);
    expect(vite.close).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
  });
});
