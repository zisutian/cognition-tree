// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentClientEvent,
  AgentSessionSnapshot,
} from '../agent/index.ts';


export type AgentEventSink = {
  open(): void;
  onClose(listener: () => void): void;
  send(event: AgentClientEvent): boolean;
  close(): void;
};

export type AgentSessionEventInput =
  | Omit<Extract<AgentClientEvent, { type: "message-delta" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentClientEvent, { type: "problem" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentClientEvent, { type: "proposal-updated" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentClientEvent, { type: "session-snapshot" }>, "sequence" | "sessionId">
  | Omit<Extract<AgentClientEvent, { type: "turn-completed" }>, "sequence" | "sessionId">;

type AgentSessionSnapshotFactory = (
  sequence: number,
) => AgentSessionSnapshot;

const maximumRetainedEvents = 1_000;

export class AgentSessionEventStream {
  readonly #eventStreams = new Set<AgentEventSink>();
  readonly #events: AgentClientEvent[] = [];
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
    sink,
  }: {
    afterSequence: number;
    createSnapshot: AgentSessionSnapshotFactory;
    sink: AgentEventSink;
  }) {
    if (this.#closed) throw new Error("Agent session event stream is closed");
    sink.open();
    const firstRetained = this.#events[0]?.sequence ?? this.#sequence;

    sink.onClose(() => this.#eventStreams.delete(sink));
    if (afterSequence < firstRetained - 1 || afterSequence > this.#sequence) {
      if (!sink.send( {
        sequence: this.#sequence,
        sessionId: this.#sessionId,
        snapshot: createSnapshot(this.#sequence),
        type: "session-snapshot",
      })) return;
    } else {
      for (const event of this.#events) {
        if (
          event.sequence > afterSequence &&
          !sink.send( event)
        ) return;
      }
    }
    this.#eventStreams.add(sink);
  }

  emit(value: AgentSessionEventInput) {
    if (this.#closed) return;
    this.#sequence += 1;
    const event = {
      ...value,
      sequence: this.#sequence,
      sessionId: this.#sessionId,
    } as AgentClientEvent;

    this.#events.push(event);
    if (this.#events.length > maximumRetainedEvents) {
      this.#events.splice(0, this.#events.length - maximumRetainedEvents);
    }
    for (const sink of this.#eventStreams) {
      if (!sink.send( event)) this.#eventStreams.delete(sink);
    }
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
    for (const sink of this.#eventStreams) {
      sink.close();
    }
    this.#eventStreams.clear();
  }
}
