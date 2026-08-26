// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import {
  OpenAiChatRuntime,
} from "../../../../infrastructure/server/agent/openAiChatRuntime.ts";
import type {
  OpenAiChatAgentProfile,
} from "../../../../infrastructure/server/agent/runtimeProfiles.ts";

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
    baseUrl,
    historyBudgetCharacters: 32_768,
    id: "openai-test",
    kind: "openai-chat",
    label: "OpenAI test",
    maxOutputTokens: 1_024,
    maxResidentSessions: 1,
    maxToolSteps: 2,
    model: "test-model",
    timeoutMilliseconds: 5_000,
    toolCallMode: "native",
  };
}

const journalCreateTool = {
  description: "Stage Journal entry creation",
  inputSchema: Type.Object({ body: Type.String() }, {
    additionalProperties: false,
  }),
  name: "stage_journal_create_entry",
} as const;

describe("OpenAI-compatible Agent runtime", () => {
  it("characterizes reasoning-only length completions as empty success", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const reasoning of ["Thinking", " about", " tools"]) {
        response.write(`data: ${JSON.stringify({
          choices: [{
            delta: { content: "", reasoning },
            finish_reason: null,
          }],
        })}\n\n`);
      }
      response.write(`data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "length" }],
      })}\n\n`);
      response.end("data: [DONE]\n\n");
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const deltas: string[] = [];
    const executeTool = vi.fn();

    try {
      await expect(session.runTurn({
        executeTool,
        messages: [{ content: "创建一条日记", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [journalCreateTool],
      })).resolves.toEqual({ finalText: "", toolCalls: 0 });
      expect(deltas).toEqual(["", "", ""]);
      expect(executeTool).not.toHaveBeenCalled();
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("requests compaction from the direct serialized character budget", async () => {
    const runtimeProfile = {
      ...profile("http://127.0.0.1:1/v1"),
      historyBudgetCharacters: 1,
    };
    const session = await new OpenAiChatRuntime(
      runtimeProfile,
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const events: unknown[] = [];

    try {
      await expect(session.runTurn({
        executeTool: vi.fn(),
        messages: [{ content: "hello", role: "user" }],
        onEvent(event) {
          events.push(event);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [],
      })).rejects.toMatchObject({ name: "AgentContextLimitError" });
      expect(events).toEqual([{
        reason: "会话历史预算已达到",
        type: "compaction-required",
      }]);
    } finally {
      await session.dispose();
    }
  });

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
                  }),
                  name: "stage_journal_create_entry",
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
      instructions: "shared instructions",
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
        tools: [journalCreateTool],
      });

      expect(result).toEqual({ finalText: "已暂存", toolCalls: 1 });
      expect(deltas).toEqual(["已", "暂存"]);
      expect(executeTool).toHaveBeenCalledWith({
        arguments: { body: "Agent entry" },
        callId: "call-1",
        name: "stage_journal_create_entry",
      });
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        model: "test-model",
        parallel_tool_calls: false,
        stream: true,
      });
      expect(requests[0]?.messages).toEqual([
        {
          content: expect.stringContaining("shared instructions"),
          role: "system",
        },
        { content: "创建一条日记", role: "user" },
      ]);
      expect(JSON.stringify(requests[1])).toContain('"role":"tool"');
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("rejects multiple native calls without executing either tool", async () => {
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      if (requestCount === 1) {
        writeSse(response, [{
          choices: [{
            delta: {
              tool_calls: [{
                function: { arguments: "{}", name: "list" },
                id: "call-list",
                index: 0,
              }, {
                function: {
                  arguments: JSON.stringify({ query: "ctn" }),
                  name: "search",
                },
                id: "call-search",
                index: 1,
              }],
            },
          }],
        }]);
        return;
      }
      writeSse(response, [{ choices: [{ delta: { content: "完成" } }] }]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: {
        domain: "workspace",
        repositoryId: "repository-1",
        target: { kind: "repository" },
      },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const executeTool = vi.fn(async () => ({ ok: true }));

    try {
      await expect(session.runTurn({
        executeTool,
        messages: [{ content: "inspect", role: "user" }],
        onEvent: vi.fn(),
        scope: {
          domain: "workspace",
          repositoryId: "repository-1",
          target: { kind: "repository" },
        },
        signal: new AbortController().signal,
        tools: [
          { description: "List", inputSchema: { type: "object" }, name: "list" },
          {
            description: "Search",
            inputSchema: { type: "object" },
            name: "search",
          },
        ],
      })).resolves.toEqual({ finalText: "完成", toolCalls: 0 });
      expect(executeTool).not.toHaveBeenCalled();
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
      instructions: "shared instructions",
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

  it("corrects a text tool envelope without displaying or executing it", async () => {
    const envelope = JSON.stringify({
      arguments: { body: "Agent entry" },
      name: "stage_journal_create_entry",
    });
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      if (requestCount === 1) {
        writeSse(response, [
          { choices: [{ delta: { content: envelope.slice(0, 20) } }] },
          { choices: [{ delta: { content: envelope.slice(20) } }] },
        ]);
        return;
      }
      if (requestCount === 2) {
        writeSse(response, [{
          choices: [{
            delta: {
              tool_calls: [{
                function: {
                  arguments: JSON.stringify({ body: "Agent entry" }),
                  name: "stage_journal_create_entry",
                },
                id: "call-corrected",
                index: 0,
              }],
            },
          }],
        }]);
        return;
      }
      writeSse(response, [{ choices: [{ delta: { content: "已暂存。" } }] }]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
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
        tools: [journalCreateTool],
      });

      expect(result).toEqual({ finalText: "已暂存。", toolCalls: 1 });
      expect(deltas).toEqual([result.finalText]);
      expect(executeTool).toHaveBeenCalledOnce();
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("preserves ordinary JSON as assistant content", async () => {
    const content = JSON.stringify({ answer: "structured on request" });
    const server = createServer((_request, response) => {
      writeSse(response, [{ choices: [{ delta: { content } }] }]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const deltas: string[] = [];

    try {
      const result = await session.runTurn({
        executeTool: vi.fn(),
        messages: [{ content: "respond", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [journalCreateTool],
      });

      expect(result.finalText).toBe(content);
      expect(deltas).toEqual([content]);
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("corrects malformed text tool JSON without displaying it", async () => {
    const invalid = '{"name":"stage_journal_create_entry","arguments":';
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      writeSse(response, [{
        choices: [{ delta: { content: requestCount === 1 ? invalid : "请重试。" } }],
      }]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const deltas: string[] = [];

    try {
      const result = await session.runTurn({
        executeTool: vi.fn(),
        messages: [{ content: "respond", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [journalCreateTool],
      });

      expect(result).toEqual({ finalText: "请重试。", toolCalls: 0 });
      expect(deltas).toEqual([result.finalText]);
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("corrects invalid native arguments without executing or displaying them", async () => {
    const requests: Record<string, unknown>[] = [];
    const server = createServer(async (request, response) => {
      requests.push(await readJson(request));
      if (requests.length === 1) {
        writeSse(response, [{
          choices: [{
            delta: {
              content: "I will call a tool.",
              tool_calls: [{
                function: {
                  arguments: "{}",
                  name: "stage_journal_create_entry",
                },
                id: "call-1",
                index: 0,
              }],
            },
          }],
        }]);
        return;
      }
      if (requests.length === 2) {
        writeSse(response, [{
          choices: [{
            delta: {
              tool_calls: [{
                function: {
                  arguments: JSON.stringify({ body: "Agent entry" }),
                  name: "stage_journal_create_entry",
                },
                id: "call-2",
                index: 0,
              }],
            },
          }],
        }]);
        return;
      }
      writeSse(response, [{ choices: [{ delta: { content: "完成" } }] }]);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const session = await new OpenAiChatRuntime(
      profile(`http://127.0.0.1:${address.port}/v1`),
      "server-secret",
    ).openSession({
      instructions: "shared instructions",
      profileId: "openai-test",
      scope: { domain: "journal", entryIds: null },
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const deltas: string[] = [];
    const executeTool = vi.fn(async () => ({ staged: true }));

    try {
      const result = await session.runTurn({
        executeTool,
        messages: [{ content: "创建一条日记", role: "user" }],
        onEvent(event) {
          if (event.type === "text-delta") deltas.push(event.textDelta);
        },
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [journalCreateTool],
      });

      expect(result).toEqual({ finalText: "完成", toolCalls: 1 });
      expect(executeTool).toHaveBeenCalledOnce();
      expect(executeTool).toHaveBeenCalledWith({
        arguments: { body: "Agent entry" },
        callId: "call-2",
        name: "stage_journal_create_entry",
      });
      expect(deltas).toEqual(["完成"]);
      expect(JSON.stringify(requests[1])).toContain("/body");
      expect(JSON.stringify(requests[1])).not.toContain(
        "I will call a tool.",
      );
    } finally {
      await session.dispose();
      server.close();
      await once(server, "close");
    }
  });
});
