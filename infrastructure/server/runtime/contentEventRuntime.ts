// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentServicePorts } from "../../../application/content/index.ts";
import type { DomainRevisionTracker } from "../../../application/sync/index.ts";
import { createApiChangeCoordinator, type ApiEventHub } from "../api/sync/index.ts";

export function createServerContentEvents({
  eventHub,
  revisionTracker,
}: {
  eventHub: ApiEventHub;
  revisionTracker: DomainRevisionTracker;
}): Pick<ContentServicePorts, "onCommitted" | "onCatalogChanged"> {
  const coordinator = createApiChangeCoordinator({
    eventHub,
    revisionTracker,
    now: () => new Date().toISOString(),
  });
  return {
    onCommitted(store, revision, changes) {
      coordinator.committed(store, revision, changes);
    },
    onCatalogChanged(repositoryId, kind, occurredAt) {
      coordinator.catalogChanged(repositoryId, kind, occurredAt);
    },
  };
}
