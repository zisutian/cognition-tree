// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import net from "node:net";
import readline from "node:readline";
import { agentToolDefinitions } from "../../../contracts/agent/tools.ts";
import type {
  AgentIpcRequestDto,
  AgentIpcResponseDto,
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

function callPrivateIpc(tool: AgentIpcRequestDto["tool"]) {
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
        sessionId,
        tool,
      };

      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
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
    if (request.method === "tools/list") {
      write({
        id,
        jsonrpc: "2.0",
        result: {
          tools: agentToolDefinitions.map(({ description, inputSchema, name }) => ({
            description,
            inputSchema,
            name,
          })),
        },
      });
      return;
    }
    if (request.method === "tools/call") {
      const params = request.params && typeof request.params === "object" &&
          !Array.isArray(request.params)
        ? request.params as Record<string, unknown>
        : {};
      const definition = agentToolDefinitions.find(({ name }) => name === params.name);

      if (!definition) {
        write({ error: { code: -32602, message: "Unknown Agent tool" }, id, jsonrpc: "2.0" });
        return;
      }
      try {
        const result = await callPrivateIpc({
          input: params.arguments ?? {},
          name: definition.name,
        } as AgentIpcRequestDto["tool"]);

        write({
          id,
          jsonrpc: "2.0",
          result: {
            content: [{ text: JSON.stringify(result), type: "text" }],
            structuredContent: result,
          },
        });
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
      }
      return;
    }
    write({ error: { code: -32601, message: "Method not found" }, id, jsonrpc: "2.0" });
  })();
});
