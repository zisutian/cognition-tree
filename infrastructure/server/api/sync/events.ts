// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type {
OutgoingHttpHeaders,
ServerResponse,
} from "node:http";
import type {
ApiChangeEventDto,
ApiCheckpointEventDto,
ApiRevisionCheckpointDto,
} from "../../../../contracts/api/index.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/index.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/index.ts";
import {
endServerSentEventResponse,
writeServerSentEvent,
} from "../../transport/index.ts";

type EventConnection = {
  response: ServerResponse;
};

function writeSseEvent(
  response: ServerResponse,
  event: string,
  value: unknown,
) {
  return writeServerSentEvent(
    response,
    `event: ${event}\ndata: ${
      serializeJsonIteratively(value, { sortObjectKeys: true })
    }\n\n`,
  );
}

export class ApiEventHub {
  readonly #connections = new Set<EventConnection>();
  #disposed = false;
  #sequence = 0;
  readonly #streamId: string;

  constructor(streamId = randomUUID()) {
    this.#streamId = streamId;
  }

  connect({
    checkpoint,
    headers,
    response,
  }: {
    checkpoint: ApiRevisionCheckpointDto;
    headers: OutgoingHttpHeaders;
      response: ServerResponse;
  }) {
    if (this.#disposed) {
      throw new Error("API event hub is disposed");
    }
    const connection = { response };

    response.writeHead(200, {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const event: ApiCheckpointEventDto = {
      checkpoint: {
        ...checkpoint,
        sequence: this.#sequence,
        streamId: this.#streamId,
      },
      sequence: this.#sequence,
      streamId: this.#streamId,
      type: "checkpoint",
    };

    response.once("close", () => this.#connections.delete(connection));
    if (!writeSseEvent(response, "checkpoint", event)) return;
    this.#connections.add(connection);
  }

  publish(
    checkpoint: ApiRevisionCheckpointDto,
    changes: DomainChangeSetDto,
  ) {
    if (this.#disposed) return;
    this.#sequence += 1;
    const event: ApiChangeEventDto = {
      changes,
      checkpoint: {
        ...checkpoint,
        sequence: this.#sequence,
        streamId: this.#streamId,
      },
      sequence: this.#sequence,
      streamId: this.#streamId,
      type: "change",
    };

    for (const connection of this.#connections) {
      if (!writeSseEvent(connection.response, "change", event)) {
        this.#connections.delete(connection);
      }
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const connection of this.#connections) {
      endServerSentEventResponse(connection.response);
    }
    this.#connections.clear();
  }

  get sequence() {
    return this.#sequence;
  }

  get streamId() {
    return this.#streamId;
  }
}
