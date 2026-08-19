// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/commandRuntime.ts";

export type PreparedSyncSnapshot<
  Content,
  Projection,
  Revision extends string,
> = Readonly<{
  content: Content;
  projection: Projection;
  revision: Revision;
}>;

export type SnapshotSyncStore<
  Content,
  Projection,
  Revision extends string,
> = {
  commit(request: {
    baseRevision: Revision;
    content: Content;
  }): Promise<{
    after: PreparedSyncSnapshot<Content, Projection, Revision>;
    before: PreparedSyncSnapshot<Content, Projection, Revision>;
    revision: Revision;
  }>;
  load(): Promise<PreparedSyncSnapshot<Content, Projection, Revision>>;
};

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
  request,
  runtime,
  store,
}: {
  projectChanges(input: {
    after: PreparedSyncSnapshot<Content, Projection, Revision>;
    before: PreparedSyncSnapshot<Content, Projection, Revision>;
    timestamp: string;
  }): Changes;
  request: SnapshotSyncRequest<Content, Revision>;
  runtime: Pick<CommandRuntime, "now">;
  store: SnapshotSyncStore<Content, Projection, Revision>;
}): Promise<SnapshotSyncResult<Content, Changes, Revision>> {
  if (request.mode === "load") {
    const snapshot = await store.load();

    return {
      content: snapshot.content,
      revision: snapshot.revision,
      status: "loaded",
    };
  }
  const { timestamp } = readCommandRuntimeNow(runtime);
  const receipt = await store.commit({
    baseRevision: request.baseRevision,
    content: request.content,
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
