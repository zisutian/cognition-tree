// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer, get, type IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";

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
});
