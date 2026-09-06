// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type {
  ApiChangeEventDto,
  ApiCheckpointEventDto,
  ApiPrincipalDto,
  ApiRevisionCheckpointDto,
} from "../../../../contracts/api/types.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import {
  endServerSentEventResponse,
  writeServerSentEvent,
} from "../../transport/serverSentEventResponse.ts";

type EventConnection = {
  principal: ApiPrincipalDto;
  response: ServerResponse;
};

function canRead(
  principal: ApiPrincipalDto,
  domain: "journal" | "todo" | "workspace",
) {
  switch (principal.kind) {
    case "local-owner":
    case "owner":
    case "trusted-client":
      return true;
    case "automation":
      return principal.scopes.includes(`${domain}:read`);
  }
}

function repositoryAllowed(
  principal: ApiPrincipalDto,
  repositoryId: string | undefined,
) {
  if (repositoryId === undefined) return true;
  switch (principal.kind) {
    case "local-owner":
    case "owner":
    case "trusted-client":
      return true;
    case "automation":
      return principal.repositoryIds === null ||
        principal.repositoryIds.includes(repositoryId);
  }
}

export function filterApiCheckpoint(
  checkpoint: ApiRevisionCheckpointDto,
  principal: ApiPrincipalDto,
): ApiRevisionCheckpointDto {
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

export function filterApiChangeSet(
  changes: DomainChangeSetDto,
  principal: ApiPrincipalDto,
): DomainChangeSetDto {
  const visibilityByResourceId = new Map<string, boolean>();
  const ambiguousResourceIds = new Set<string>();
  const resources = changes.resources.filter((resource) => {
    const visible = canRead(principal, resource.domain) &&
      repositoryAllowed(principal, resource.repositoryId);
    const previous = visibilityByResourceId.get(resource.resourceId);

    if (previous !== undefined && previous !== visible) {
      ambiguousResourceIds.add(resource.resourceId);
    }
    visibilityByResourceId.set(resource.resourceId, visible);
    return visible;
  });

  return {
    blocks: changes.blocks.filter(({ resourceId }) =>
      visibilityByResourceId.get(resourceId) === true &&
      !ambiguousResourceIds.has(resourceId)
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
    principal,
    response,
  }: {
    checkpoint: ApiRevisionCheckpointDto;
    headers: OutgoingHttpHeaders;
    principal: ApiPrincipalDto;
    response: ServerResponse;
  }) {
    if (this.#disposed) {
      throw new Error("API event hub is disposed");
    }
    const connection = { principal, response };

    response.writeHead(200, {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const event: ApiCheckpointEventDto = {
      checkpoint: {
        ...filterApiCheckpoint(checkpoint, principal),
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
      const filteredEvent: ApiChangeEventDto = {
        ...event,
        changes: filterApiChangeSet(changes, connection.principal),
        checkpoint: filterApiCheckpoint(
          event.checkpoint,
          connection.principal,
        ),
      };

      if (!writeSseEvent(connection.response, "change", filteredEvent)) {
        this.#connections.delete(connection);
      }
    }
  }

  revokePrincipal(principalId: string) {
    for (const connection of this.#connections) {
      if (connection.principal.id !== principalId) continue;
      endServerSentEventResponse(connection.response);
      this.#connections.delete(connection);
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
