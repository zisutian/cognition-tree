// SPDX-License-Identifier: GPL-3.0-or-later

import net from "node:net";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import {
  callAgentPrivateIpc,
} from "../../../../infrastructure/server/agent/privateIpcClient.ts";

const sessionId = "00000000-0000-4000-8000-000000000001";

async function createResponseServer(
  respond: (request: Record<string, unknown>) => string,
) {
  const server = net.createServer((socket) => {
    let source = "";

    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      source += chunk;
      const boundary = source.indexOf("\n");

      if (boundary < 0) return;
      const request = JSON.parse(source.slice(0, boundary)) as Record<
        string,
        unknown
      >;

      socket.end(respond(request));
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") throw new Error("Missing port");
  return {
    close: async () => {
      server.close();
      await once(server, "close");
    },
    endpoint: { host: "127.0.0.1", port: address.port },
  };
}

function call(endpoint: net.NetConnectOpts) {
  return callAgentPrivateIpc({
    capability: "test-capability",
    endpoint,
    payload: { kind: "list-tools" },
    sessionId,
  });
}

describe("private Agent IPC client", () => {
  it("waits for one complete correlated response", async () => {
    const server = await createResponseServer((request) => `${JSON.stringify({
      id: request.id,
      result: { tools: [] },
    })}\n`);

    try {
      await expect(call(server.endpoint)).resolves.toEqual({ tools: [] });
    } finally {
      await server.close();
    }
  });

  it("rejects incomplete and multiple responses", async () => {
    for (const respond of [
      (request: Record<string, unknown>) => JSON.stringify({
        id: request.id,
        result: null,
      }),
      (request: Record<string, unknown>) => `${JSON.stringify({
        id: request.id,
        result: null,
      })}\n${JSON.stringify({ id: request.id, result: null })}\n`,
    ]) {
      const server = await createResponseServer(respond);

      try {
        await expect(call(server.endpoint)).rejects.toThrow(/response|framing/i);
      } finally {
        await server.close();
      }
    }
  });
});
