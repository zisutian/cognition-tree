// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  readSseFrames,
  SseFrameError,
} from "../../../../infrastructure/sse/index.ts";

const encoder = new TextEncoder();

function stream(chunks: readonly Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function frames(body: ReadableStream<Uint8Array>, limit = 1_000) {
  const result: string[] = [];
  for await (const frame of readSseFrames(body, limit)) result.push(frame);
  return result;
}

describe("neutral SSE framing", () => {
  it("decodes split UTF-8 and normalizes CR, LF and CRLF across chunks", async () => {
    const bytes = encoder.encode("data: 你好\r\ndata: second\r\rdata: third\n\n");
    const split = bytes.indexOf(0xe5) + 1;
    await expect(frames(stream([
      bytes.slice(0, split),
      bytes.slice(split, split + 2),
      bytes.slice(split + 2, 19),
      bytes.slice(19),
    ]))).resolves.toEqual([
      "data: 你好\ndata: second",
      "data: third",
    ]);
  });

  it("accepts the exact frame limit and rejects a longer frame", async () => {
    await expect(frames(stream([encoder.encode("data:x\n\n")]), 6))
      .resolves.toEqual(["data:x"]);
    await expect(frames(stream([
      encoder.encode("data:x\n"),
      encoder.encode("\n"),
    ]), 6)).resolves.toEqual(["data:x"]);
    await expect(frames(stream([
      encoder.encode("data:x\r"),
      encoder.encode("\n"),
      encoder.encode("\r"),
      encoder.encode("\n"),
    ]), 6)).resolves.toEqual(["data:x"]);
    await expect(frames(stream([encoder.encode("data:xx\n\n")]), 6))
      .rejects.toMatchObject({ code: "oversized_frame" } satisfies Partial<SseFrameError>);
    await expect(frames(stream([
      encoder.encode("data:x\n"),
      encoder.encode("x\n\n"),
    ]), 6)).rejects.toMatchObject({ code: "oversized_frame" } satisfies Partial<SseFrameError>);
  });

  it("reports invalid bytes and an incomplete trailing frame", async () => {
    const invalid = stream([new Uint8Array([0x64, 0x61, 0x74, 0x61, 0x3a, 0xc3, 0x28])]);
    await expect(frames(invalid))
      .rejects.toMatchObject({ code: "invalid_utf8" } satisfies Partial<SseFrameError>);
    expect(invalid.locked).toBe(false);
    const truncatedUtf8 = stream([new Uint8Array([0x64, 0x61, 0x74, 0x61, 0x3a, 0xc3])]);
    await expect(frames(truncatedUtf8))
      .rejects.toMatchObject({ code: "invalid_utf8" } satisfies Partial<SseFrameError>);
    expect(truncatedUtf8.locked).toBe(false);
    await expect(frames(stream([encoder.encode("data: unfinished\n")])) )
      .rejects.toMatchObject({ code: "incomplete_frame" } satisfies Partial<SseFrameError>);
  });

  it("cancels on early return and preserves a read failure", async () => {
    let cancelled = false;
    const ongoing = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("data: one\n\n")); },
      cancel() { cancelled = true; },
    });
    const reader = readSseFrames(ongoing, 1_000);
    await expect(reader.next()).resolves.toMatchObject({ value: "data: one" });
    await reader.return(undefined);
    expect(cancelled).toBe(true);
    expect(ongoing.locked).toBe(false);

    const failure = new Error("read failed");
    const failed = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(failure); },
    });
    await expect(frames(failed)).rejects.toBe(failure);
    expect(failed.locked).toBe(false);
  });
});
