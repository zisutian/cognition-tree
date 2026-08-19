// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type {
  ApiV1ChangeEventDto,
  ApiV1CheckpointEventDto,
  ApiV1DomainChangeSetDto,
  ApiV1PrincipalDto,
  ApiV1RevisionCheckpointDto,
} from "../../../../contracts/api/types.ts";

type EventConnection = {
  principal: ApiV1PrincipalDto;
  response: ServerResponse;
};

function canRead(
  principal: ApiV1PrincipalDto,
  domain: "journal" | "todo" | "workspace",
) {
  return principal.scopes.includes("sync") ||
    principal.scopes.includes(`${domain}:read`);
}

function repositoryAllowed(
  principal: ApiV1PrincipalDto,
  repositoryId: string | undefined,
) {
  return repositoryId === undefined ||
    principal.repositoryIds === null ||
    principal.repositoryIds.includes(repositoryId);
}

export function filterApiV1Checkpoint(
  checkpoint: ApiV1RevisionCheckpointDto,
  principal: ApiV1PrincipalDto,
): ApiV1RevisionCheckpointDto {
  return {
    journal: canRead(principal, "journal") ? checkpoint.journal : null,
    sequence: checkpoint.sequence,
    streamId: checkpoint.streamId,
    todo: canRead(principal, "todo") ? checkpoint.todo : null,
    workspaces: canRead(principal, "workspace")
      ? Object.fromEntries(
          Object.entries(checkpoint.workspaces).filter(([repositoryId]) =>
            repositoryAllowed(principal, repositoryId)
          ),
        )
      : {},
  };
}

export function filterApiV1ChangeSet(
  changes: ApiV1DomainChangeSetDto,
  principal: ApiV1PrincipalDto,
): ApiV1DomainChangeSetDto {
  const resources = changes.resources.filter(({ domain, repositoryId }) =>
    canRead(principal, domain) &&
    repositoryAllowed(principal, repositoryId)
  );
  const visibleResourceIds = new Set(
    resources.map(({ resourceId }) => resourceId),
  );

  return {
    blocks: changes.blocks.filter(({ resourceId }) =>
      visibleResourceIds.has(resourceId)
    ),
    occurredAt: changes.occurredAt,
    resources,
  };
}

function writeSseEvent(
  response: ServerResponse,
  event: string,
  value: unknown,
) {
  response.write(
    `event: ${event}\ndata: ${
      serializeJsonIteratively(value, { sortObjectKeys: true })
    }\n\n`,
  );
}

export class ApiV1EventHub {
  readonly #connections = new Set<EventConnection>();
  #sequence = 0;
  readonly #streamId: string;

  constructor(streamId = randomUUID()) {
    this.#streamId = streamId;
  }

  connect({
    checkpoint,
    headers,
    principal,
    response,
  }: {
    checkpoint: ApiV1RevisionCheckpointDto;
    headers: OutgoingHttpHeaders;
    principal: ApiV1PrincipalDto;
    response: ServerResponse;
  }) {
    const connection = { principal, response };

    response.writeHead(200, {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const event: ApiV1CheckpointEventDto = {
      checkpoint: {
        ...filterApiV1Checkpoint(checkpoint, principal),
        sequence: this.#sequence,
        streamId: this.#streamId,
      },
      sequence: this.#sequence,
      streamId: this.#streamId,
      type: "checkpoint",
    };

    writeSseEvent(response, "checkpoint", event);
    this.#connections.add(connection);
    response.once("close", () => this.#connections.delete(connection));
  }

  publish(
    checkpoint: ApiV1RevisionCheckpointDto,
    changes: ApiV1DomainChangeSetDto,
  ) {
    this.#sequence += 1;
    const event: ApiV1ChangeEventDto = {
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
      const filteredEvent: ApiV1ChangeEventDto = {
        ...event,
        changes: filterApiV1ChangeSet(changes, connection.principal),
        checkpoint: filterApiV1Checkpoint(
          event.checkpoint,
          connection.principal,
        ),
      };

      writeSseEvent(connection.response, "change", filteredEvent);
    }
  }

  revokePrincipal(principalId: string) {
    for (const connection of this.#connections) {
      if (connection.principal.id !== principalId) continue;
      connection.response.end();
      this.#connections.delete(connection);
    }
  }

  get sequence() {
    return this.#sequence;
  }

  get streamId() {
    return this.#streamId;
  }
}
