// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseAgentSchema,
  AgentIpcResponseSchema,
} from "../../../contracts/agent/index.ts";


export type SessionMcpRequestParseResult =
  | { kind: "notification" }
  | {
      code: -32700 | -32600;
      id: number | string | null;
      kind: "error";
      message: "Invalid Request" | "Parse error";
    }
  | {
      id: number | string;
      kind: "request";
      request: Record<string, unknown> & {
        jsonrpc: "2.0";
        method: string;
      };
    };

export function parseSessionMcpRequestLine(
  source: string,
): SessionMcpRequestParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return {
      code: -32700,
      id: null,
      kind: "error",
      message: "Parse error",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      code: -32600,
      id: null,
      kind: "error",
      message: "Invalid Request",
    };
  }
  const request = parsed as Record<string, unknown>;

  if (!("id" in request)) return { kind: "notification" };
  const id = typeof request.id === "string" || typeof request.id === "number"
    ? request.id
    : null;

  if (id === null || request.jsonrpc !== "2.0" ||
      typeof request.method !== "string") {
    return {
      code: -32600,
      id,
      kind: "error",
      message: "Invalid Request",
    };
  }
  return {
    id,
    kind: "request",
    request: request as Record<string, unknown> & {
      jsonrpc: "2.0";
      method: string;
    },
  };
}

export function parsePrivateIpcResult(source: string, expectedId: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Private Agent IPC returned invalid JSON");
  }
  const response = parseAgentSchema(AgentIpcResponseSchema, parsed);

  if (response.id !== expectedId) {
    throw new Error("Private Agent IPC response id does not match");
  }
  if ("error" in response) throw new Error(response.error.message);
  return response.result;
}
