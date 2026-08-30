// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiEventInitialReconnectDelayMs,
  createHttpApiEventSource,
} from "../../../../infrastructure/client/http/apiEvents";

function emptyEventStream() {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.useRealTimers());

describe("HTTP API event source", () => {
  it("backs off repeatedly when a connection carries no valid event", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => emptyEventStream());
    const source = createHttpApiEventSource({
      baseUrl: "https://ctn.example",
      fetch: fetch as typeof globalThis.fetch,
    });

    source.start();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(apiEventInitialReconnectDelayMs);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(
        apiEventInitialReconnectDelayMs * 2 - 1,
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      source.dispose();
    }
  });
});
