// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SnapshotSyncStore,
} from "../../../application/sync/snapshotSync.ts";

type SnapshotContentStore<Content, Projection, Revision extends string> = {
  commitSnapshot(request: {
    baseRevision: Revision;
    content: Content;
  }): Promise<{
    after: { content: Content; projection: Projection; revision: Revision };
    before: { content: Content; projection: Projection; revision: Revision };
    revision: Revision;
  }>;
  loadSnapshot(): Promise<{
    content: Content;
    projection: Projection;
    revision: Revision;
  }>;
};

export function createSnapshotSyncStoreAdapter<
  Content,
  Projection,
  Revision extends string,
>(
  store: SnapshotContentStore<Content, Projection, Revision>,
): SnapshotSyncStore<Content, Projection, Revision> {
  return {
    commit: (request) => store.commitSnapshot(request),
    load: () => store.loadSnapshot(),
  };
}
