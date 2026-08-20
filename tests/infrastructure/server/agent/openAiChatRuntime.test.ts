// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  OpenAiChatRuntime,
} from "../../../../infrastructure/server/agent/openAiChatRuntime.ts";
import type {
  OpenAiChatAgentProfile,
} from "../../../../infrastructure/server/agent/profiles.ts";

async function readJson(request: IncomingMessage) {
  let source = "";

  for await (const chunk of request) source += chunk.toString();
  return JSON.parse(source) as Record<string, unknown>;
}

function writeSse(response: ServerResponse, values: unknown[]) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const value of values) {
    response.write(`data: ${JSON.stringify(value)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

function profile(baseUrl: string): OpenAiChatAgentProfile {
  return {
    apiKeyEnv: "TEST_KEY",
    baseUrl,
    contextWindowTokens: 8_192,
    id: "openai-test",
    kind: "openai-chat",
    label: "OpenAI test",
    maxOutputTokens: 1_024,
    maxResidentSessions: 1,
    maxToolSteps: 2,
    model: "test-model",
    timeoutMilliseconds: 5_000,
  };
}

describe("OpenAI-compatible Agent runtime", () => {
  it("streams text and executes sequential tool calls through the supplied port", async () => {
    const requests: Record<string, unknown>[] = [];
    const server = createServer(async (request, response) => {
      requests.push(await readJson(request));
      if (requests.length === 1) {
        writeSse(response, [{
          choices: [{
            delta: {
              tool_calls: [{
                function: {
                  arguments: JSON.stringify({
                    body: "Agent entry",
                    kind: "create-entry",
                  }),
                  name: "stage_journal_command",
                },
                id: "call-1",
                index: 0,
              }],
            },
          }],
        }]);
        return;
      }
      writeSse(response, [
        { choices: [{ delta: { content: "已" } }] },
        { choices: [{ delta: { content: "暂存" } }] },
      ]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const runtime = new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    );
    const session = await runtime.openSession({
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const executeTool = vi.fn(async () => ({ staged: true }));
    const deltas: string[] = [];

    try {
      const result = await session.runTurn({
        executeTool,
        messages: [{ content: "创建一条日记", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [{
          description: "Stage Journal intent",
          inputSchema: { type: "object" },
          name: "stage_journal_command",
        }],
      });

      expect(result).toEqual({ finalText: "已暂存", toolCalls: 1 });
      expect(deltas).toEqual(["已", "暂存"]);
      expect(executeTool).toHaveBeenCalledWith({
        arguments: { body: "Agent entry", kind: "create-entry" },
        callId: "call-1",
        name: "stage_journal_command",
      });
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        model: "test-model",
        parallel_tool_calls: false,
        stream: true,
      });
      expect(JSON.stringify(requests[1])).toContain('"role":"tool"');
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("aborts an active stream when the session is cancelled", async () => {
    let response!: ServerResponse;
    let resolveReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      resolveReceived = resolve;
    });
    const server = createServer((_request, current) => {
      response = current;
      current.writeHead(200, { "Content-Type": "text/event-stream" });
      current.flushHeaders();
      resolveReceived();
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const runtime = new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    );
    const session = await runtime.openSession({
      profileId: "openai-test",
      scope: { collectionIds: null, domain: "todo" },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const turn = session.runTurn({
      executeTool: vi.fn(),
      messages: [{ content: "wait", role: "user" }],
      onEvent: vi.fn(),
      scope: { collectionIds: null, domain: "todo" },
      signal: new AbortController().signal,
      tools: [],
    });

    try {
      await received;
      await session.cancel();
      await expect(turn).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      response.end();
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });
});
