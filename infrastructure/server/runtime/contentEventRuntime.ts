// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentServicePorts } from "../../../application/content/index.ts";
import type { DomainRevisionTracker } from "../../../application/sync/index.ts";
import type { ApiEventHub } from "../api/sync/index.ts";

export function createServerContentEvents({
  eventHub,
  revisionTracker,
}: {
  eventHub: ApiEventHub;
  revisionTracker: DomainRevisionTracker;
}): Pick<ContentServicePorts, "onCommitted" | "onCatalogChanged"> {
  const checkpoint = () =>
    revisionTracker.checkpoint({
      sequence: eventHub.sequence,
      streamId: eventHub.streamId,
    });
  return {
    onCommitted(store, revision, changes) {
      if (store.domain === "workspace")
        revisionTracker.observeWorkspace(store.repositoryId, revision);
      else revisionTracker.observeDomain(store.domain, revision);
      eventHub.publish(checkpoint(), changes);
    },
    onCatalogChanged(repositoryId, kind, occurredAt) {
      if (kind === "deleted") revisionTracker.removeWorkspace(repositoryId);
      eventHub.publish(checkpoint(), {
        blocks: [],
        occurredAt,
        resources: [
          { domain: "workspace", kind, repositoryId, resourceId: repositoryId },
        ],
      });
    },
  };
}
