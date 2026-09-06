// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createHttpAgentClient } from "../../../../infrastructure/client/http/agentClient";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("HTTP Agent client", () => {
  it("uses owner-only v3 message operations", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `https://ctn.example/api/v4/agent/sessions/${sessionId}/messages`,
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ content: "hello" });
      expect(new Headers(init?.headers).get("Authorization"))
        .toBe("Bearer owner-token");
      return Response.json({
        accepted: true,
        turnId: "00000000-0000-4000-8000-000000000002",
      }, { status: 202 });
    });
    const client = createHttpAgentClient({
      baseUrl: "https://ctn.example",
      fetch: fetch as typeof globalThis.fetch,
      token: "owner-token",
    });

    await expect(client.sendMessage(sessionId, "hello")).resolves
      .toBeUndefined();
  });

  it("parses incremental SSE events with the requested sequence cursor", async () => {
    let requestedUrl = "";
    const event = {
      messageId: "00000000-0000-4000-8000-000000000003",
      sequence: 9,
      sessionId,
      textDelta: "增量",
      type: "message-delta",
    } as const;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoded = new TextEncoder().encode(
          `event: message-delta\nid: 9\ndata: ${JSON.stringify(event)}\n\n`,
        );

        controller.enqueue(encoded.slice(0, 17));
        controller.enqueue(encoded.slice(17));
        controller.close();
      },
    });
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    const client = createHttpAgentClient({
      baseUrl: "https://ctn.example",
      fetch: fetch as typeof globalThis.fetch,
    });
    const received = new Promise<typeof event>((resolve, reject) => {
      client.openEvents({
        afterSequence: 8,
        onClose: reject,
        onEvent: (value) => resolve(value as typeof event),
        sessionId,
      });
    });

    await expect(received).resolves.toEqual(event);
    expect(requestedUrl).toBe(
      `https://ctn.example/api/v4/agent/sessions/${sessionId}/events?afterSequence=8`,
    );
  });

  it("treats a clean SSE end as a reconnect signal instead of an error", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const client = createHttpAgentClient({
      baseUrl: "https://ctn.example",
      fetch: vi.fn(async () => new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof globalThis.fetch,
    });
    const closed = new Promise<unknown>((resolve) => {
      client.openEvents({
        afterSequence: 0,
        onClose: resolve,
        onEvent: vi.fn(),
        sessionId,
      });
    });

    await expect(closed).resolves.toBeNull();
  });
});
