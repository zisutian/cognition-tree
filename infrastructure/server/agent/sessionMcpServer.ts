// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import net from "node:net";
import readline from "node:readline";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import type {
  AgentIpcRequestDto,
  AgentIpcResponseDto,
} from "../../../contracts/agent/ipc.ts";
import {
  AgentIpcToolCatalogSchema,
  type AgentIpcToolCatalogDto,
} from "../../../contracts/agent/ipc.ts";

const configuredEndpoint = process.env.CTN_AGENT_IPC_ENDPOINT;
const configuredCapability = process.env.CTN_AGENT_SESSION_CAPABILITY;
const configuredSessionId = process.env.CTN_AGENT_SESSION_ID;

if (!configuredEndpoint || !configuredCapability || !configuredSessionId) {
  throw new Error("Session MCP private IPC environment is incomplete");
}
const endpoint: string = configuredEndpoint;
const capability: string = configuredCapability;
const sessionId: string = configuredSessionId;

function write(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

type AgentIpcToolCallRequest = Extract<
  AgentIpcRequestDto,
  { kind: "call-tool" }
>;
type AgentIpcRequestPayload =
  | { kind: "list-tools" }
  | { kind: "call-tool"; tool: AgentIpcToolCallRequest["tool"] };

function callPrivateIpc(payload: AgentIpcRequestPayload) {
  return new Promise<unknown>((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let source = "";

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk: string) => {
      source += chunk;
      const boundary = source.indexOf("\n");

      if (boundary < 0) return;
      socket.destroy();
      let response: AgentIpcResponseDto;

      try {
        response = JSON.parse(source.slice(0, boundary)) as AgentIpcResponseDto;
      } catch {
        reject(new Error("Private Agent IPC returned invalid JSON"));
        return;
      }
      if ("error" in response) reject(new Error(response.error.message));
      else resolve(response.result);
    });
    socket.once("connect", () => {
      const request: AgentIpcRequestDto = {
        capability,
        id: randomUUID(),
        ...payload,
        sessionId,
      };

      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

async function listTools(): Promise<AgentIpcToolCatalogDto> {
  return parseAgentSchema(
    AgentIpcToolCatalogSchema,
    await callPrivateIpc({ kind: "list-tools" }),
  );
}

const input = readline.createInterface({ input: process.stdin });

input.on("line", (line) => {
  void (async () => {
    let request: Record<string, unknown>;

    try {
      request = JSON.parse(line) as Record<string, unknown>;
    } catch {
      write({ error: { code: -32700, message: "Parse error" }, id: null, jsonrpc: "2.0" });
      return;
    }
    if (!("id" in request)) return;
    const id = request.id;

    if (request.method === "initialize") {
      write({
        id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: { listChanged: false } },
          protocolVersion: "2025-06-18",
          serverInfo: { name: "cognition-tree-session-agent", version: "1.0.0" },
        },
      });
      return;
    }
    try {
      if (request.method === "tools/list") {
        const tools = await listTools();

        write({
          id,
          jsonrpc: "2.0",
          result: {
            tools,
          },
        });
        return;
      }
      if (request.method === "tools/call") {
        const params = request.params && typeof request.params === "object" &&
            !Array.isArray(request.params)
          ? request.params as Record<string, unknown>
          : {};
        const definition = (await listTools()).find(({ name }) =>
          name === params.name
        );

        if (!definition) {
          write({ error: { code: -32602, message: "Unknown Agent tool" }, id, jsonrpc: "2.0" });
          return;
        }
        const result = await callPrivateIpc({
          kind: "call-tool",
          tool: {
            input: params.arguments ?? {},
            name: definition.name,
          } as AgentIpcToolCallRequest["tool"],
        });

        write({
          id,
          jsonrpc: "2.0",
          result: {
            content: [{ text: JSON.stringify(result), type: "text" }],
            structuredContent: result,
          },
        });
        return;
      }
    } catch (error) {
      write({
        id,
        jsonrpc: "2.0",
        result: {
          content: [{
            text: error instanceof Error ? error.message : "Agent tool failed",
            type: "text",
          }],
          isError: true,
        },
      });
      return;
    }
    write({ error: { code: -32601, message: "Method not found" }, id, jsonrpc: "2.0" });
  })();
});
