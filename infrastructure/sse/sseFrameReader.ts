// SPDX-License-Identifier: GPL-3.0-or-later

export type SseFrameFailure = "invalid_utf8" | "oversized_frame" | "incomplete_frame";

export class SseFrameError extends Error {
  readonly code: SseFrameFailure;
  readonly cause: unknown;

  constructor(code: SseFrameFailure, cause?: unknown) {
    super(code);
    this.name = "SseFrameError";
    this.code = code;
    this.cause = cause;
  }
}

/** Transport-neutral SSE framing; protocol-specific data and errors stay with each caller. */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
  maximumFrameCharacters: number,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let pendingCarriageReturn = false;
  let reachedEnd = false;

  const appendDecoded = (bytes?: Uint8Array) => {
    let decoded: string;
    try {
      decoded = bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
    } catch (error) {
      throw new SseFrameError("invalid_utf8", error);
    }
    let source = pendingCarriageReturn ? `\r${decoded}` : decoded;
    pendingCarriageReturn = false;
    if (bytes && source.endsWith("\r")) {
      pendingCarriageReturn = true;
      source = source.slice(0, -1);
    }
    buffer += source.replace(/\r\n|\r/g, "\n");
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEnd = true;
        appendDecoded();
      } else {
        appendDecoded(value);
      }
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary < 0) {
          // A final LF may be the first half of the frame terminator.
          const unresolvedLength = buffer.length - (buffer.endsWith("\n") ? 1 : 0);
          if (unresolvedLength > maximumFrameCharacters) {
            throw new SseFrameError("oversized_frame");
          }
          break;
        }
        if (boundary > maximumFrameCharacters) {
          throw new SseFrameError("oversized_frame");
        }
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        yield frame;
      }
      if (!done) continue;
      if (buffer.length > 0) throw new SseFrameError("incomplete_frame");
      break;
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The framing or consumer result remains authoritative.
      }
    }
    reader.releaseLock();
  }
}
