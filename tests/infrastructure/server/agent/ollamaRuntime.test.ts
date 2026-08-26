// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import { OllamaRuntime } from "../../../../infrastructure/server/agent/ollamaRuntime.ts";
import type { OllamaAgentProfile } from "../../../../infrastructure/server/agent/runtimeProfiles.ts";

function writeSse(response: ServerResponse, content: string) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  response.write(`data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: "stop" }],
  })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function profile(
  baseUrl: string,
  toolCallMode: "native" | "single-json" = "single-json",
): OllamaAgentProfile {
  return {
    baseUrl,
    historyBudgetCharacters: 32_768,
    id: "ollama-test",
    kind: "ollama",
    label: "Ollama test",
    maxOutputTokens: 1_024,
    maxResidentSessions: 1,
    maxToolSteps: 2,
    model: "test-model",
    timeoutMilliseconds: 5_000,
    toolCallMode,
  };
}

async function withSession(
  completions: string[],
  run: (session: Awaited<ReturnType<OllamaRuntime["openSession"]>>) => Promise<void>,
) {
  let index = 0;
  const server = createServer((_request, response) => {
    writeSse(response, completions[index++] ?? "");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") throw new Error("Missing port");
  const session = await new OllamaRuntime(
    profile(`http://127.0.0.1:${address.port}/v1`),
  ).openSession({
    instructions: "shared instructions",
    profileId: "ollama-test",
    scope: { domain: "journal", entryIds: null },
    sessionId: "00000000-0000-4000-8000-000000000001",
  });

  try {
    await run(session);
  } finally {
    await session.dispose();
    server.close();
    await once(server, "close");
  }
}

const tool = {
  description: "Conformance tool",
  inputSchema: Type.Object({ ack: Type.Literal(true) }, {
    additionalProperties: false,
  }),
  name: "conformance_check",
} as const;

describe("Ollama Agent runtime", () => {
  it("executes a strict single-json tool envelope without displaying it", async () => {
    const envelope = JSON.stringify({ arguments: { ack: true }, name: tool.name });

    await withSession([envelope, "验证完成。"], async (session) => {
      const executeTool = vi.fn(async () => ({ accepted: true }));
      const deltas: string[] = [];
      const result = await session.runTurn({
        executeTool,
        messages: [{ content: "验证工具", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [tool],
      });

      expect(executeTool).toHaveBeenCalledWith({
        arguments: { ack: true },
        callId: "single-json-1",
        name: tool.name,
      });
      expect(result).toEqual({ finalText: "验证完成。", toolCalls: 1 });
      expect(deltas).toEqual(["验证完成。"]);
      expect(deltas).not.toContain(envelope);
    });
  });

  it("preserves ordinary JSON as the final answer", async () => {
    const answer = JSON.stringify({ answer: "structured" });

    await withSession([answer], async (session) => {
      const result = await session.runTurn({
        executeTool: vi.fn(),
        messages: [{ content: "返回 JSON", role: "user" }],
        onEvent: vi.fn(),
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [tool],
      });

      expect(result.finalText).toBe(answer);
    });
  });

  it.each([
    ["unknown tool", { arguments: { ack: true }, name: "unknown" }],
    ["invalid arguments", { arguments: { ack: false }, name: tool.name }],
    ["extra field", { arguments: { ack: true }, name: tool.name, extra: true }],
  ])("corrects an invalid %s envelope before executing", async (_label, value) => {
    const corrected = JSON.stringify({
      arguments: { ack: true },
      name: tool.name,
    });

    await withSession([
      JSON.stringify(value),
      corrected,
      "验证完成。",
    ], async (session) => {
      const executeTool = vi.fn(async () => ({ accepted: true }));
      const deltas: string[] = [];
      const result = await session.runTurn({
        executeTool,
        messages: [{ content: "验证工具", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [tool],
      });

      expect(result).toEqual({ finalText: "验证完成。", toolCalls: 1 });
      expect(executeTool).toHaveBeenCalledOnce();
      expect(deltas).toEqual([result.finalText]);
    });
  });

  it("fails with the tool name and field path after correction is exhausted", async () => {
    const invalid = JSON.stringify({
      arguments: { ack: false },
      name: tool.name,
    });

    await withSession([invalid, invalid, invalid], async (session) => {
      const executeTool = vi.fn();

      await expect(session.runTurn({
        executeTool,
        messages: [{ content: "验证工具", role: "user" }],
        onEvent: vi.fn(),
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [tool],
      })).rejects.toThrow(/conformance_check.*\/ack/i);
      expect(executeTool).not.toHaveBeenCalled();
    });
  });
});
