// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer, get, type IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { closeApiServer } from "../../../../infrastructure/server/api/http/serverLifecycle.ts";
import { ApiEventHub } from "../../../../infrastructure/server/api/sync/events.ts";

describe("API server lifecycle", () => {
  it("reports an aborted response when an active SSE socket is force-closed", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: connected\n\n");
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected an IP server address");
    }

    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = get({
        host: "127.0.0.1",
        path: "/events",
        port: address.port,
      }, resolve);

      request.once("error", reject);
    });
    const aborted = once(response, "aborted");
    const responseClosed = new Promise<void>((resolve) => {
      response.once("close", resolve);
    });

    const serverClosed = new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    server.closeAllConnections();
    await Promise.all([aborted, responseClosed, serverClosed]);

    expect(server.listening).toBe(false);
    expect(response.destroyed).toBe(true);
  });

  it("lets the stream owner end SSE before closing the server", async () => {
    const eventHub = new ApiEventHub("00000000-0000-4000-8000-000000000001");
    const server = createServer((_request, response) => {
      eventHub.connect({
        checkpoint: {
          journal: null,
          sequence: 0,
          streamId: eventHub.streamId,
          todo: null,
          workspaces: {},
        },
        headers: {},
        principal: {
          id: "local-owner",
          kind: "local-owner",
          name: "本机官方客户端",
        },
        response,
      });
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const response = await connect(server);
    let aborted = false;

    response.once("aborted", () => {
      aborted = true;
    });
    const responseEnded = once(response, "end");

    response.resume();

    await closeApiServer({
      closeOwnedResources: () => eventHub.dispose(),
      forceAfterMilliseconds: 100,
      server,
    });
    await responseEnded;

    expect(aborted).toBe(false);
    expect(response.complete).toBe(true);
    expect(server.listening).toBe(false);
  });

  it("force-closes an SSE connection whose owner does not release it", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: connected\n\n");
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const response = await connect(server);
    const aborted = once(response, "aborted");

    await closeApiServer({
      closeOwnedResources: () => undefined,
      forceAfterMilliseconds: 10,
      server,
    });
    await aborted;

    expect(response.destroyed).toBe(true);
    expect(server.listening).toBe(false);
  });
});

async function connect(server: ReturnType<typeof createServer>) {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected an IP server address");
  }
  return await new Promise<IncomingMessage>((resolve, reject) => {
    const request = get({
      host: "127.0.0.1",
      path: "/events",
      port: address.port,
    }, resolve);

    request.once("error", reject);
  });
}
