// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type {
  ApiPrincipalDto,
  ApiRevisionCheckpointDto,
} from "../../../../contracts/api/types.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import {
  ApiEventHub,
  filterApiChangeSet,
} from "../../../../infrastructure/server/api/sync/events.ts";

class EventResponse {
  readonly chunks: string[] = [];
  readonly response: ServerResponse;
  destroyed = 0;
  failWrites = false;
  writeCalls = 0;

  constructor() {
    const owner = this;

    this.response = {
      destroy: () => {
        this.destroyed += 1;
      },
      get destroyed() {
        return owner.destroyed > 0;
      },
      end: () => undefined,
      once: () => this.response,
      write: (chunk: string | Uint8Array) => {
        this.writeCalls += 1;
        if (this.failWrites) throw new Error("event connection failed");
        this.chunks.push(String(chunk));
        return true;
      },
      writeHead: (
        _statusCode: number,
        _headers: OutgoingHttpHeaders,
      ) => this.response,
    } as unknown as ServerResponse;
  }
}

const principal: ApiPrincipalDto = {
  id: "owner",
  kind: "owner",
  name: "Owner",
};

const streamId = "00000000-0000-4000-8000-000000000001";

const checkpoint: ApiRevisionCheckpointDto = {
  journal: null,
  sequence: 0,
  streamId,
  todo: null,
  workspaces: {},
};

const changes: DomainChangeSetDto = {
  blocks: [],
  occurredAt: "2026-08-30T00:00:00.000Z",
  resources: [],
};

describe("API event hub", () => {
  it("isolates a failed client from post-commit event publication", () => {
    const hub = new ApiEventHub(streamId);
    const failed = new EventResponse();
    const healthy = new EventResponse();

    hub.connect({
      checkpoint,
      headers: {},
      principal,
      response: failed.response,
    });
    hub.connect({
      checkpoint,
      headers: {},
      principal,
      response: healthy.response,
    });
    failed.failWrites = true;

    expect(() => hub.publish(checkpoint, changes)).not.toThrow();
    hub.publish(checkpoint, changes);

    expect(failed.destroyed).toBe(1);
    expect(failed.writeCalls).toBe(2);
    expect(healthy.chunks).toHaveLength(3);
    expect(hub.sequence).toBe(2);
  });

  it("drops block changes whose resource id has mixed visibility", () => {
    const automation: ApiPrincipalDto = {
      id: "automation",
      kind: "automation",
      name: "Workspace reader",
      repositoryIds: ["repository-a"],
      scopes: ["workspace:read"],
    };
    const filtered = filterApiChangeSet({
      blocks: [{
        blockId: "block-shared",
        kind: "updated",
        resourceId: "resource-shared",
        updatedAt: "2026-08-30T00:00:00.000Z",
      }],
      occurredAt: "2026-08-30T00:00:00.000Z",
      resources: [
        {
          domain: "workspace",
          kind: "updated",
          repositoryId: "repository-a",
          resourceId: "resource-shared",
        },
        {
          domain: "journal",
          kind: "updated",
          resourceId: "resource-shared",
        },
      ],
    }, automation);

    expect(filtered.resources).toEqual([
      expect.objectContaining({ domain: "workspace" }),
    ]);
    expect(filtered.blocks).toEqual([]);
  });

  it("does not advance a disposed event stream", () => {
    const hub = new ApiEventHub(streamId);

    hub.dispose();
    hub.publish(checkpoint, changes);

    expect(hub.sequence).toBe(0);
  });
});
