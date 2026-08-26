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

    writeSseEvent(response, "checkpoint", event);
    this.#connections.add(connection);
    response.once("close", () => this.#connections.delete(connection));
  }

  publish(
    checkpoint: ApiRevisionCheckpointDto,
    changes: DomainChangeSetDto,
  ) {
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

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const connection of this.#connections) {
      connection.response.end();
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
