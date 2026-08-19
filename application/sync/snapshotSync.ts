// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/commandRuntime.ts";
import type {
  PreparedVersionedSnapshot,
  PreparedVersionedStore,
} from "../persistence/versionedRepository.ts";

export type SnapshotSyncStore<
  Content,
  Projection,
  Revision extends string,
> = PreparedVersionedStore<Content, Projection, Revision>;

export type SnapshotSyncRequest<Content, Revision extends string> =
  | { mode: "load" }
  | {
      baseRevision: Revision;
      content: Content;
      mode: "commit";
    };

export type SnapshotSyncResult<Content, Changes, Revision extends string> =
  | {
      content: Content;
      revision: Revision;
      status: "loaded";
    }
  | {
      changes: Changes;
      revision: Revision;
      status: "committed";
    };

export async function executeSnapshotSync<
  Content,
  Projection,
  Changes,
  Revision extends string,
>({
  projectChanges,
  prepare,
  request,
  runtime,
  store,
}: {
  prepare(
    content: Content,
    previous: Projection,
  ): Projection;
  projectChanges(input: {
    after: PreparedVersionedSnapshot<Content, Projection, Revision>;
    before: PreparedVersionedSnapshot<Content, Projection, Revision>;
    timestamp: string;
  }): Changes;
  request: SnapshotSyncRequest<Content, Revision>;
  runtime: Pick<CommandRuntime, "now">;
  store: SnapshotSyncStore<Content, Projection, Revision>;
}): Promise<SnapshotSyncResult<Content, Changes, Revision>> {
  if (request.mode === "load") {
    const snapshot = await store.loadSnapshot();

    return {
      content: snapshot.content,
      revision: snapshot.revision,
      status: "loaded",
    };
  }
  const { timestamp } = readCommandRuntimeNow(runtime);
  const before = await store.loadSnapshot();
  const projection = prepare(request.content, before.projection);
  const receipt = await store.commit({
    baseRevision: request.baseRevision,
    content: request.content,
    projection,
  });

  return {
    changes: projectChanges({
      after: receipt.after,
      before: receipt.before,
      timestamp,
    }),
    revision: receipt.revision,
    status: "committed",
  };
}
