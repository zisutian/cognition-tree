// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  AgentEventDto,
  AgentSessionSnapshotDto,
} from "../../../contracts/agent/schemas.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";

export type AgentSessionEventInput =
  | Omit<Extract<AgentEventDto, { type: "message-delta" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "problem" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "proposal-updated" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "session-snapshot" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentEventDto, { type: "turn-completed" }>, "sequence" | "sessionId">;

type AgentSessionSnapshotFactory = (
  sequence: number,
) => AgentSessionSnapshotDto;

const maximumRetainedEvents = 1_000;

function writeAgentEvent(response: ServerResponse, event: AgentEventDto) {
  response.write(
    `event: ${event.type}\nid: ${event.sequence}\ndata: ${
      serializeJsonIteratively(event, { sortObjectKeys: true })
    }\n\n`,
  );
}

export class AgentSessionEventStream {
  readonly #eventStreams = new Set<ServerResponse>();
  readonly #events: AgentEventDto[] = [];
  readonly #sessionId: string;
  #closed = false;
  #sequence = 0;

  constructor(sessionId: string) {
    this.#sessionId = sessionId;
  }

  get sequence() {
    return this.#sequence;
  }

  connect({
    afterSequence,
    createSnapshot,
    headers,
    response,
  }: {
    afterSequence: number;
    createSnapshot: AgentSessionSnapshotFactory;
    headers: OutgoingHttpHeaders;
    response: ServerResponse;
  }) {
    if (this.#closed) throw new Error("Agent session event stream is closed");
    response.writeHead(200, {
      ...headers,
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const firstRetained = this.#events[0]?.sequence ?? this.#sequence;

    if (afterSequence < firstRetained - 1 || afterSequence > this.#sequence) {
      writeAgentEvent(response, {
        sequence: this.#sequence,
        sessionId: this.#sessionId,
        snapshot: createSnapshot(this.#sequence),
        type: "session-snapshot",
      });
    } else {
      for (const event of this.#events) {
        if (event.sequence > afterSequence) writeAgentEvent(response, event);
      }
    }
    this.#eventStreams.add(response);
    response.once("close", () => this.#eventStreams.delete(response));
  }

  emit(value: AgentSessionEventInput) {
    if (this.#closed) return;
    this.#sequence += 1;
    const event = {
      ...value,
      sequence: this.#sequence,
      sessionId: this.#sessionId,
    } as AgentEventDto;

    this.#events.push(event);
    if (this.#events.length > maximumRetainedEvents) {
      this.#events.splice(0, this.#events.length - maximumRetainedEvents);
    }
    for (const response of this.#eventStreams) writeAgentEvent(response, event);
  }

  emitSnapshot(createSnapshot: AgentSessionSnapshotFactory) {
    if (this.#closed) return;
    const sequence = this.#sequence + 1;

    this.emit({
      snapshot: createSnapshot(sequence),
      type: "session-snapshot",
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const response of this.#eventStreams) response.end();
    this.#eventStreams.clear();
  }
}
