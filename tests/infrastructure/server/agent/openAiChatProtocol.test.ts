// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  appendOpenAiToolDelta,
  countOpenAiChatStreamChunkCharacters,
  openAiChatSseFrameCharacterLimit,
  parseOpenAiChatStreamChunk,
  readOpenAiChatSse,
} from "../../../../infrastructure/server/agent/openAiChatProtocol.ts";

const encoder = new TextEncoder();

function responseFromChunks(
  chunks: readonly string[],
  onCancel: () => void = () => undefined,
) {
  return new Response(new ReadableStream<Uint8Array>({
    cancel: onCancel,
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }));
}

async function collectSse(response: Response) {
  const values: string[] = [];

  for await (const value of readOpenAiChatSse(response)) values.push(value);
  return values;
}

describe("OpenAI-compatible SSE protocol", () => {
  it("parses CRLF boundaries split across transport chunks", async () => {
    const response = responseFromChunks([
      "data: first\r",
      "\n\r\ndata: second\r\n\r\n",
    ]);

    await expect(collectSse(response)).resolves.toEqual(["first", "second"]);
  });

  it("rejects an SSE frame that exceeds the transport limit", async () => {
    const response = responseFromChunks([
      `data: ${"x".repeat(openAiChatSseFrameCharacterLimit)}`,
    ]);

    await expect(collectSse(response)).rejects.toThrow(/oversized SSE frame/i);
  });

  it("rejects a partial frame at end of stream", async () => {
    const response = responseFromChunks(["data: incomplete\n"]);

    await expect(collectSse(response)).rejects.toThrow(/incomplete SSE frame/i);
  });

  it("cancels the response stream when its consumer stops early", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    }));

    for await (const value of readOpenAiChatSse(response)) {
      expect(value).toBe("[DONE]");
      break;
    }
    expect(cancelled).toBe(true);
  });
});

describe("OpenAI-compatible stream chunks", () => {
  it("parses one typed choice and its tool-call deltas", () => {
    expect(parseOpenAiChatStreamChunk({
      choices: [{
        delta: {
          content: null,
          reasoning: "working",
          tool_calls: [{
            function: { arguments: "{", name: "stage_" },
            id: "call-1",
            index: 0,
            type: "function",
          }],
        },
        finish_reason: null,
        index: 0,
      }],
    })).toEqual({
      content: null,
      finishReason: null,
      reasoning: "working",
      toolCalls: [{
        arguments: "{",
        callId: "call-1",
        index: 0,
        name: "stage_",
      }],
    });
  });

  it("rejects malformed choices and consumed delta fields", () => {
    for (const value of [
      {},
      { choices: [] },
      { choices: [{ delta: null }] },
      { choices: [{ delta: { content: 1 } }] },
      { choices: [{ delta: { tool_calls: {} } }] },
      { choices: [{ delta: { tool_calls: [{ index: -1 }] } }] },
    ]) {
      expect(() => parseOpenAiChatStreamChunk(value)).toThrow(
        /OpenAI-compatible runtime emitted/i,
      );
    }
  });

  it("rejects a tool-call id that changes between deltas", () => {
    const pending = new Map();

    appendOpenAiToolDelta(pending, [{
      arguments: null,
      callId: "call-1",
      index: 0,
      name: null,
    }]);
    expect(() => appendOpenAiToolDelta(pending, [{
      arguments: null,
      callId: "call-2",
      index: 0,
      name: null,
    }])).toThrow(/changed a tool-call id/i);
  });

  it("charges text and structural tool deltas to the completion budget", () => {
    expect(countOpenAiChatStreamChunkCharacters({
      content: "answer",
      finishReason: "tool_calls",
      reasoning: "private",
      toolCalls: [{
        arguments: "{}",
        callId: "call-1",
        index: 0,
        name: "lookup",
      }],
    })).toBe(
      "answer".length + "tool_calls".length + "private".length +
        1 + "{}".length + "call-1".length + "lookup".length,
    );
    expect(countOpenAiChatStreamChunkCharacters({
      content: null,
      finishReason: null,
      reasoning: null,
      toolCalls: [{
        arguments: null,
        callId: null,
        index: 999,
        name: null,
      }],
    })).toBe(1);
  });
});
