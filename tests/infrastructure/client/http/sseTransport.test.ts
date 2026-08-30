// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  maximumHttpSseFrameCharacters,
  readHttpSseData,
} from "../../../../infrastructure/client/http/sseTransport";

const encoder = new TextEncoder();

function responseFromChunks(chunks: readonly string[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }));
}

async function collect(response: Response) {
  const values: string[] = [];

  for await (const value of readHttpSseData(response)) values.push(value);
  return values;
}

describe("HTTP SSE transport", () => {
  it("parses multiline data across fragmented CRLF boundaries", async () => {
    const response = responseFromChunks([
      "event: change\r\ndata: first\r",
      "\ndata: second\r\n\r\n",
    ]);

    await expect(collect(response)).resolves.toEqual(["first\nsecond"]);
  });

  it("rejects oversized and incomplete frames", async () => {
    await expect(collect(responseFromChunks([
      `data: ${"x".repeat(maximumHttpSseFrameCharacters)}`,
    ]))).rejects.toThrow(/transport limit/i);
    await expect(collect(responseFromChunks([
      "data: incomplete\n",
    ]))).rejects.toThrow(/incomplete frame/i);
  });
});
