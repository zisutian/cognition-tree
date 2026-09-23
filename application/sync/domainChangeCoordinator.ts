// SPDX-License-Identifier: GPL-3.0-or-later

import type { DomainChangeSet } from "../../core/sync/index.ts";
import {
  DomainRevisionTracker,
  type DomainRevisionObservation,
  type TrackedContentDomain,
} from "./domainRevisionTracker.ts";
import type { DomainRevisionCheckpoint } from "./domainChangeEvents.ts";

type Revision = `sha256:${string}`;
type EventChangeSet = Omit<DomainChangeSet, "resources"> & {
  resources: (Omit<DomainChangeSet["resources"][number], "version"> & {
    version?: string;
  })[];
};

export type DomainChangeCoordinatorPorts = {
  sequence(): number;
  streamId(): string;
  now(): string;
  publish(checkpoint: DomainRevisionCheckpoint<Revision>, changes: EventChangeSet): void;
};

/** Coordinates revision observations and event publication for all content domains. */
export class DomainChangeCoordinator {
  private readonly tracker: DomainRevisionTracker;
  private readonly ports: DomainChangeCoordinatorPorts;

  constructor(
    tracker: DomainRevisionTracker,
    ports: DomainChangeCoordinatorPorts,
  ) {
    this.tracker = tracker;
    this.ports = ports;
  }

  checkpoint(): DomainRevisionCheckpoint<Revision> {
    return this.tracker.checkpoint({
      sequence: this.ports.sequence(),
      streamId: this.ports.streamId(),
    });
  }

  publish(changes: EventChangeSet): void {
    this.ports.publish(this.checkpoint(), changes);
  }

  recordWorkspace(repositoryId: string, revision: Revision): DomainRevisionObservation {
    return this.tracker.observeWorkspace(repositoryId, revision);
  }

  recordDomain(domain: TrackedContentDomain, revision: Revision): DomainRevisionObservation {
    return this.tracker.observeDomain(domain, revision);
  }

  observeWorkspace(repositoryId: string, revision: Revision): void {
    if (this.recordWorkspace(repositoryId, revision) !== "changed") return;
    this.publish({
      blocks: [],
      occurredAt: this.ports.now(),
      resources: [{
        domain: "workspace",
        kind: "updated",
        repositoryId,
        resourceId: repositoryId,
        version: revision,
      }],
    });
  }

  observeDomain(domain: TrackedContentDomain, revision: Revision): void {
    if (this.recordDomain(domain, revision) !== "changed") return;
    this.publish({
      blocks: [],
      occurredAt: this.ports.now(),
      resources: [{domain, kind: "updated", resourceId: domain, version: revision}],
    });
  }

  reconcileWorkspaceIds(repositoryIds: ReadonlySet<string>): void {
    const removed = this.tracker.reconcileWorkspaceIds(repositoryIds);
    if (removed.length === 0) return;
    this.publish({
      blocks: [],
      occurredAt: this.ports.now(),
      resources: removed.map((repositoryId) => ({
        domain: "workspace",
        kind: "deleted",
        repositoryId,
        resourceId: repositoryId,
      })),
    });
  }

  committed(
    store: {domain: "workspace"; repositoryId: string} | {domain: TrackedContentDomain},
    revision: Revision,
    changes: DomainChangeSet,
  ): void {
    if (store.domain === "workspace") this.recordWorkspace(store.repositoryId, revision);
    else this.recordDomain(store.domain, revision);
    this.publish(changes);
  }

  catalogChanged(
    repositoryId: string,
    kind: "created" | "updated" | "deleted",
    occurredAt: string,
  ): void {
    if (kind === "deleted") this.tracker.removeWorkspace(repositoryId);
    this.publish({
      blocks: [],
      occurredAt,
      resources: [{domain: "workspace", kind, repositoryId, resourceId: repositoryId}],
    });
  }
}
