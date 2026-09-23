// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DomainChangeCoordinator,
  type DomainRevisionTracker,
} from "../../../../application/sync/index.ts";
import type { ApiEventHub } from "./events.ts";

export function createApiChangeCoordinator({
  eventHub,
  revisionTracker,
  now,
}: {
  eventHub: ApiEventHub;
  revisionTracker: DomainRevisionTracker;
  now(): string;
}): DomainChangeCoordinator {
  return new DomainChangeCoordinator(revisionTracker, {
    sequence: () => eventHub.sequence,
    streamId: () => eventHub.streamId,
    now,
    publish: (checkpoint, changes) => eventHub.publish(checkpoint, changes),
  });
}
