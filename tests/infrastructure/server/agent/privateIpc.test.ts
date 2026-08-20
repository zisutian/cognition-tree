// SPDX-License-Identifier: GPL-3.0-or-later

import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentIpcRequestDto,
  AgentIpcResponseDto,
} from "../../../../contracts/agent/ipc.ts";
import {
  AgentPrivateIpcServer,
} from "../../../../infrastructure/server/agent/privateIpc.ts";

const sessionId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";

function call(
  endpoint: string,
  request: AgentIpcRequestDto,
): Promise<AgentIpcResponseDto> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let source = "";

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk: string) => {
      source += chunk;
      const boundary = source.indexOf("\n");

      if (boundary < 0) return;
      socket.destroy();
      resolve(JSON.parse(source.slice(0, boundary)) as AgentIpcResponseDto);
    });
    socket.once("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

describe("private Agent IPC capability", () => {
  it("binds a short-lived capability to exactly one session", async () => {
    const ipc = new AgentPrivateIpcServer();
    const endpoint = await ipc.start();
    const handle = vi.fn(async () => ({ resources: ["allowed"] }));
    const capability = ipc.register({
      expiresAt: Date.now() + 60_000,
      handle,
      sessionId,
    });
    const request: AgentIpcRequestDto = {
      capability,
      id: requestId,
      sessionId,
      tool: { input: { domain: "journal" }, name: "list" },
    };

    try {
      await expect(call(endpoint, request)).resolves.toEqual({
        id: requestId,
        result: { resources: ["allowed"] },
      });
      expect(handle).toHaveBeenCalledOnce();
      const wrongSession = await call(endpoint, {
        ...request,
        sessionId: "00000000-0000-4000-8000-000000000003",
      });

      expect(wrongSession).toMatchObject({
        error: { code: "invalid_capability" },
      });
      ipc.revoke(capability);
      const revoked = await call(endpoint, request);

      expect(revoked).toMatchObject({
        error: { code: "invalid_capability" },
      });
      expect(handle).toHaveBeenCalledOnce();
    } finally {
      await ipc.dispose();
    }
  });

  it("rejects an expired capability without invoking the tool", async () => {
    const ipc = new AgentPrivateIpcServer();
    const endpoint = await ipc.start();
    const handle = vi.fn();
    const capability = ipc.register({
      expiresAt: Date.now() - 1,
      handle,
      sessionId,
    });

    try {
      const response = await call(endpoint, {
        capability,
        id: requestId,
        sessionId,
        tool: { input: { domain: "todo" }, name: "list" },
      });

      expect(response).toMatchObject({
        error: { code: "invalid_capability" },
      });
      expect(handle).not.toHaveBeenCalled();
    } finally {
      await ipc.dispose();
    }
  });
});
