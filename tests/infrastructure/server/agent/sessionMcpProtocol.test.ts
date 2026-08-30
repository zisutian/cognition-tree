// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parsePrivateIpcResult,
  parseSessionMcpRequestLine,
} from "../../../../infrastructure/server/agent/sessionMcpProtocol.ts";

const requestId = "00000000-0000-4000-8000-000000000001";

describe("session MCP protocol", () => {
  it("parses requests and ignores notifications", () => {
    expect(parseSessionMcpRequestLine(JSON.stringify({
      id: 7,
      jsonrpc: "2.0",
      method: "tools/list",
    }))).toMatchObject({
      id: 7,
      kind: "request",
      request: { method: "tools/list" },
    });
    expect(parseSessionMcpRequestLine(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }))).toEqual({ kind: "notification" });
  });

  it("rejects invalid JSON-RPC input without throwing", () => {
    expect(parseSessionMcpRequestLine("{"))
      .toMatchObject({ code: -32700, id: null, kind: "error" });
    for (const value of [null, [], 1, "request"]) {
      expect(parseSessionMcpRequestLine(JSON.stringify(value)))
        .toMatchObject({ code: -32600, id: null, kind: "error" });
    }
    expect(parseSessionMcpRequestLine(JSON.stringify({
      id: {},
      jsonrpc: "2.0",
      method: "tools/list",
    }))).toMatchObject({ code: -32600, id: null, kind: "error" });
  });

  it("validates and correlates private IPC responses", () => {
    expect(parsePrivateIpcResult(JSON.stringify({
      id: requestId,
      result: { tools: [] },
    }), requestId)).toEqual({ tools: [] });
    expect(() => parsePrivateIpcResult(JSON.stringify({
      error: { code: "tool_failed", message: "injected failure" },
      id: requestId,
    }), requestId)).toThrow("injected failure");
    expect(() => parsePrivateIpcResult(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000002",
      result: null,
    }), requestId)).toThrow("response id does not match");
    expect(() => parsePrivateIpcResult("null", requestId)).toThrow();
  });
});
