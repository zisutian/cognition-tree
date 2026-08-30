// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type {
  AgentSessionSnapshotDto,
} from "../../../../contracts/agent/schemas.ts";
import {
  AgentSessionEventStream,
} from "../../../../infrastructure/server/agent/sessionEventStream.ts";

const sessionId = "00000000-0000-4000-8000-000000000001";
const turnId = "00000000-0000-4000-8000-000000000002";

class RecordingResponse {
  readonly chunks: string[] = [];
  readonly response: ServerResponse;
  destroyed = 0;
  ended = 0;
  failWrites = false;
  headers: OutgoingHttpHeaders | null = null;
  statusCode: number | null = null;
  writeResult = true;
  #closeListener: (() => void) | null = null;

  constructor() {
    const owner = this;

    this.response = {
      destroy: () => {
        this.destroyed += 1;
      },
      get destroyed() {
        return owner.destroyed > 0;
      },
      end: () => {
        this.ended += 1;
      },
      once: (
        event: string,
        listener: (...arguments_: unknown[]) => void,
      ) => {
        if (event === "close") this.#closeListener = () => listener();
      },
      write: (chunk: string | Uint8Array) => {
        if (this.failWrites) throw new Error("event connection failed");
        this.chunks.push(String(chunk));
        return this.writeResult;
      },
      writeHead: (statusCode: number, headers: OutgoingHttpHeaders) => {
        this.statusCode = statusCode;
        this.headers = headers;
      },
    } as unknown as ServerResponse;
  }

  close() {
    this.#closeListener?.();
  }
}

function createSnapshot(sequence: number) {
  return { id: sessionId, sequence } as AgentSessionSnapshotDto;
}

describe("Agent session event stream", () => {
  it("owns event sequencing, framing, replay, and live delivery", () => {
    const events = new AgentSessionEventStream(sessionId);
    const snapshotSequences: number[] = [];

    events.emitSnapshot((sequence) => {
      snapshotSequences.push(sequence);
      return createSnapshot(sequence);
    });
    events.emit({ code: "agent_turn_failed", message: "failed", type: "problem" });
    const response = new RecordingResponse();

    events.connect({
      afterSequence: 1,
      createSnapshot,
      headers: { "Access-Control-Allow-Origin": "https://ctn.example" },
      response: response.response,
    });

    expect(snapshotSequences).toEqual([1]);
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      "Access-Control-Allow-Origin": "https://ctn.example",
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    expect(response.chunks).toEqual([
      `event: problem\nid: 2\ndata: {"code":"agent_turn_failed","message":"failed","sequence":2,"sessionId":"${sessionId}","type":"problem"}\n\n`,
    ]);

    events.emit({ status: "completed", turnId, type: "turn-completed" });

    expect(response.chunks[1]).toBe(
      `event: turn-completed\nid: 3\ndata: {"sequence":3,"sessionId":"${sessionId}","status":"completed","turnId":"${turnId}","type":"turn-completed"}\n\n`,
    );
    response.close();
    events.emit({ code: "after_close", message: "ignored", type: "problem" });
    expect(events.sequence).toBe(4);
    expect(response.chunks).toHaveLength(2);
  });

  it("resynchronizes outside the retained window and closes active responses", () => {
    const events = new AgentSessionEventStream(sessionId);

    for (let sequence = 1; sequence <= 1_001; sequence += 1) {
      events.emit({
        code: "problem",
        message: String(sequence),
        type: "problem",
      });
    }
    const stale = new RecordingResponse();
    const retainedBoundary = new RecordingResponse();
    const ahead = new RecordingResponse();
    const snapshotSequences: number[] = [];
    const snapshot = (sequence: number) => {
      snapshotSequences.push(sequence);
      return createSnapshot(sequence);
    };

    events.connect({
      afterSequence: 0,
      createSnapshot: snapshot,
      headers: {},
      response: stale.response,
    });
    events.connect({
      afterSequence: 1,
      createSnapshot: snapshot,
      headers: {},
      response: retainedBoundary.response,
    });
    events.connect({
      afterSequence: 1_002,
      createSnapshot: snapshot,
      headers: {},
      response: ahead.response,
    });

    const resynchronization =
      `event: session-snapshot\nid: 1001\ndata: {"sequence":1001,"sessionId":"${sessionId}","snapshot":{"id":"${sessionId}","sequence":1001},"type":"session-snapshot"}\n\n`;

    expect(snapshotSequences).toEqual([1_001, 1_001]);
    expect(stale.chunks).toEqual([resynchronization]);
    expect(retainedBoundary.chunks).toHaveLength(1_000);
    expect(retainedBoundary.chunks[0]).toContain("id: 2\n");
    expect(retainedBoundary.chunks.at(-1)).toContain("id: 1001\n");
    expect(ahead.chunks).toEqual([resynchronization]);

    events.close();
    events.close();
    events.emit({ code: "after_close", message: "ignored", type: "problem" });
    events.emitSnapshot(snapshot);

    expect(stale.ended).toBe(1);
    expect(retainedBoundary.ended).toBe(1);
    expect(ahead.ended).toBe(1);
    expect(events.sequence).toBe(1_001);
    expect(snapshotSequences).toEqual([1_001, 1_001]);
    expect(() => events.connect({
      afterSequence: 1_001,
      createSnapshot,
      headers: {},
      response: new RecordingResponse().response,
    })).toThrow("Agent session event stream is closed");
  });

  it("disconnects a backpressured stream without interrupting other clients", () => {
    const events = new AgentSessionEventStream(sessionId);
    const backpressured = new RecordingResponse();
    const healthy = new RecordingResponse();

    events.connect({
      afterSequence: 0,
      createSnapshot,
      headers: {},
      response: backpressured.response,
    });
    events.connect({
      afterSequence: 0,
      createSnapshot,
      headers: {},
      response: healthy.response,
    });
    backpressured.writeResult = false;

    events.emit({ code: "first", message: "first", type: "problem" });
    events.emit({ code: "second", message: "second", type: "problem" });

    expect(backpressured.destroyed).toBe(1);
    expect(backpressured.chunks).toHaveLength(1);
    expect(healthy.chunks).toHaveLength(2);
    expect(events.sequence).toBe(2);
  });
});
