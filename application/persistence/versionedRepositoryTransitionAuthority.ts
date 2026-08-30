// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositorySnapshot,
  VersionedRepositorySnapshotTransition,
} from "./versionedRepository";

export type VersionedRepositoryTransitionAuthority<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> = {
  accept(
    transitions: readonly VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >[],
  ): boolean;
  compact(): void;
  getSnapshot(): VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
};

export function createVersionedRepositoryTransitionAuthority<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
>(
  initialSnapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >,
): VersionedRepositoryTransitionAuthority<
  Content,
  Projection,
  Revision,
  LocalRevision
> {
  const acceptedLocalRevisions = new Set<LocalRevision>([
    initialSnapshot.localRevision,
  ]);
  let pendingTransitions: VersionedRepositorySnapshotTransition<
    Content,
    Projection,
    Revision,
    LocalRevision
  >[] = [];
  let snapshot = initialSnapshot;

  return {
    accept(transitions) {
      pendingTransitions.push(...transitions);
      let changed = false;

      while (true) {
        pendingTransitions = pendingTransitions.filter(
          (transition) =>
            transition.previousLocalRevision === snapshot.localRevision ||
            !acceptedLocalRevisions.has(transition.previousLocalRevision),
        );
        const nextIndex = pendingTransitions.findIndex(
          (transition) =>
            transition.previousLocalRevision === snapshot.localRevision,
        );

        if (nextIndex < 0) break;
        const [next] = pendingTransitions.splice(nextIndex, 1);

        if (!next) {
          throw new Error("Repository authority transition disappeared.");
        }
        snapshot = next.snapshot;
        acceptedLocalRevisions.add(snapshot.localRevision);
        changed = true;
      }
      return changed;
    },
    compact() {
      if (pendingTransitions.length > 0) return;
      acceptedLocalRevisions.clear();
      acceptedLocalRevisions.add(snapshot.localRevision);
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
