// SPDX-License-Identifier: GPL-3.0-or-later

import type { Readable } from "node:stream";

export const maximumAgentJsonLineBytes = 1_000_000;

export type JsonLineFramingFailure =
  | "incomplete-line"
  | "invalid-utf8"
  | "oversized-line"
  | "read-failed";

export function listenToAgentJsonLines(
  input: Readable,
  callbacks: Readonly<{
    onEnd?(): void;
    onFailure(failure: JsonLineFramingFailure): void;
    onLine(line: string): boolean | void;
  }>,
) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let active = true;
  let lineBytes = 0;
  let lineChunks: Buffer[] = [];

  const stop = () => {
    if (!active) return;
    active = false;
    input.off("data", onData);
    input.off("end", onEnd);
    input.off("error", onError);
    input.pause();
    lineChunks = [];
    lineBytes = 0;
  };
  const fail = (failure: JsonLineFramingFailure) => {
    if (!active) return;
    stop();
    callbacks.onFailure(failure);
  };
  const append = (source: Buffer, start: number, end: number) => {
    const length = end - start;

    if (length === 0) return true;
    if (lineBytes + length > maximumAgentJsonLineBytes) {
      fail("oversized-line");
      return false;
    }
    lineChunks.push(Buffer.from(source.subarray(start, end)));
    lineBytes += length;
    return true;
  };
  const emitLine = () => {
    const source = Buffer.concat(lineChunks, lineBytes);
    const content = source[source.length - 1] === 0x0d
      ? source.subarray(0, source.length - 1)
      : source;
    let line: string;

    lineChunks = [];
    lineBytes = 0;
    try {
      line = decoder.decode(content);
    } catch {
      fail("invalid-utf8");
      return;
    }
    if (callbacks.onLine(line) === false) stop();
  };
  function onData(value: Buffer | string) {
    const source = Buffer.isBuffer(value) ? value : Buffer.from(value);
    let start = 0;

    while (active && start < source.length) {
      const boundary = source.indexOf(0x0a, start);

      if (boundary < 0) {
        append(source, start, source.length);
        return;
      }
      if (!append(source, start, boundary)) return;
      emitLine();
      start = boundary + 1;
    }
  }
  function onEnd() {
    if (!active) return;
    if (lineBytes > 0) {
      fail("incomplete-line");
      return;
    }
    stop();
    callbacks.onEnd?.();
  }
  function onError() {
    fail("read-failed");
  }

  input.on("data", onData);
  input.once("end", onEnd);
  input.once("error", onError);
  return stop;
}
