// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  openAiChatSseFrameCharacterLimit,
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
