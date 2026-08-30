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
      listTools: () => [{
        description: "List scoped resources",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" },
        name: "list",
      }],
      sessionId,
    });
    const request: AgentIpcRequestDto = {
      capability,
      id: requestId,
      kind: "call-tool",
      sessionId,
      tool: { input: {}, name: "list" },
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
      const revokedList = await call(endpoint, {
        capability,
        id: requestId,
        kind: "list-tools",
        sessionId,
      });

      expect(revokedList).toMatchObject({
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
      listTools: () => [],
      sessionId,
    });

    try {
      const response = await call(endpoint, {
        capability,
        id: requestId,
        kind: "call-tool",
        sessionId,
        tool: { input: {}, name: "list" },
      });

      expect(response).toMatchObject({
        error: { code: "invalid_capability" },
      });
      expect(handle).not.toHaveBeenCalled();
    } finally {
      await ipc.dispose();
    }
  });

  it("shares one listener across concurrent starts", async () => {
    const ipc = new AgentPrivateIpcServer();

    try {
      const [first, second] = await Promise.all([ipc.start(), ipc.start()]);

      expect(second).toBe(first);
      expect(ipc.endpoint).toBe(first);
    } finally {
      await ipc.dispose();
    }
  });

  it("does not publish a listener after disposal begins", async () => {
    const ipc = new AgentPrivateIpcServer();
    const starting = ipc.start();
    const disposal = ipc.dispose();

    try {
      await expect(starting).rejects.toThrow("Agent private IPC is closing");
      await disposal;
      expect(() => ipc.endpoint).toThrow("Agent private IPC is not started");
      await expect(ipc.start()).rejects.toThrow("Agent private IPC is closing");
      expect(() => ipc.register({
        expiresAt: Date.now() + 60_000,
        handle: async () => ({}),
        listTools: () => [],
        sessionId,
      })).toThrow("Agent private IPC is closing");
    } finally {
      await ipc.dispose();
    }
  });

  it("waits for a tool request after its client disconnects", async () => {
    const ipc = new AgentPrivateIpcServer();
    const endpoint = await ipc.start();
    let resolveHandle!: (value: unknown) => void;
    const handle = vi.fn(() => new Promise<unknown>((resolve) => {
      resolveHandle = resolve;
    }));
    const capability = ipc.register({
      expiresAt: Date.now() + 60_000,
      handle,
      listTools: () => [],
      sessionId,
    });
    const socket = net.createConnection(endpoint);

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(`${JSON.stringify({
      capability,
      id: requestId,
      kind: "call-tool",
      sessionId,
      tool: { input: {}, name: "list" },
    } satisfies AgentIpcRequestDto)}\n`);
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());
    socket.destroy();
    const disposal = ipc.dispose();
    let disposed = false;

    void disposal.then(
      () => {
        disposed = true;
      },
      () => undefined,
    );
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(disposed).toBe(false);
    } finally {
      resolveHandle({ resources: [] });
      await disposal;
    }
    expect(disposed).toBe(true);
  });
});
