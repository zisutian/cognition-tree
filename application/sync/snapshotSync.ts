// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/index.ts";
import type {
  PreparedVersionedSnapshot,
  PreparedVersionedStore,
  VersionedContentMergePolicy,
} from "../persistence/index.ts";

export type SnapshotSyncStore<
  Content,
  Projection,
  Revision extends string,
> = PreparedVersionedStore<Content, Projection, Revision>;

export type SnapshotSyncRequest<Content, Revision extends string> =
  | { mode: "load" }
  | {
      base: Readonly<{ content: Content; revision: Revision }>;
      content: Content;
      mode: "commit";
    };

export type SnapshotSyncResult<Content, Changes, Revision extends string> =
  | {
      snapshot: Readonly<{ content: Content; revision: Revision }>;
      status: "loaded";
    }
  | {
      changes: Changes | null;
      outcome: "auto-merged" | "committed" | "unchanged";
      snapshot: Readonly<{ content: Content; revision: Revision }>;
      status: "synchronized";
    };

export class SnapshotSyncBaseRevisionError extends Error {
  constructor() {
    super("Snapshot base content does not match its revision.");
    this.name = "SnapshotSyncBaseRevisionError";
  }
}

export class SnapshotSyncMergeConflictError<Revision extends string = string>
  extends Error {
  readonly baseRevision: Revision;
  readonly currentRevision: Revision;
  readonly unitIds: readonly string[];

  constructor(input: {
    baseRevision: Revision;
    currentRevision: Revision;
    unitIds: readonly string[];
  }) {
    super("Snapshot changes overlap with the current content.");
    this.name = "SnapshotSyncMergeConflictError";
    this.baseRevision = input.baseRevision;
    this.currentRevision = input.currentRevision;
    this.unitIds = [...new Set(input.unitIds)].sort();
  }
}

export class SnapshotSyncRevisionConflictError<Revision extends string = string>
  extends Error {
  readonly currentRevision: Revision;

  constructor(currentRevision: Revision) {
    super("Snapshot changed during exact commit.");
    this.name = "SnapshotSyncRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export class SnapshotSyncRetryExhaustedError<Revision extends string = string>
  extends Error {
  readonly currentRevision: Revision;

  constructor(currentRevision: Revision) {
    super("Snapshot changed repeatedly while synchronizing.");
    this.name = "SnapshotSyncRetryExhaustedError";
    this.currentRevision = currentRevision;
  }
}

export async function executeSnapshotSync<
  Content,
  Projection,
  Changes,
  Revision extends string,
>({
  merge,
  projectChanges,
  prepare,
  request,
  revisionOf,
  runtime,
  store,
}: {
  merge: VersionedContentMergePolicy<Content, Projection>;
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
  revisionOf(content: Content): Revision;
  runtime: Pick<CommandRuntime, "now">;
  store: SnapshotSyncStore<Content, Projection, Revision>;
}): Promise<SnapshotSyncResult<Content, Changes, Revision>> {
  if (request.mode === "load") {
    const snapshot = await store.loadSnapshot();

    return {
      snapshot: { content: snapshot.content, revision: snapshot.revision },
      status: "loaded",
    };
  }
  if (revisionOf(request.base.content) !== request.base.revision) {
    throw new SnapshotSyncBaseRevisionError();
  }
  const { timestamp } = readCommandRuntimeNow(runtime);
  let latestRevision = request.base.revision;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.loadSnapshot();

    latestRevision = current.revision;
    const direct = current.revision === request.base.revision;
    const desired = (() => {
      if (direct) {
        return {
          content: request.content,
          projection: prepare(request.content, current.projection),
        };
      }
      const base = {
        content: request.base.content,
        projection: prepare(request.base.content, current.projection),
      };
      const local = {
        content: request.content,
        projection: prepare(request.content, base.projection),
      };
      const merged = merge(base, local, current);

      if (merged.status === "conflict") {
        throw new SnapshotSyncMergeConflictError({
          baseRevision: request.base.revision,
          currentRevision: current.revision,
          unitIds: merged.unitIds,
        });
      }
      return merged;
    })();

    if (revisionOf(desired.content) === current.revision) {
      return {
        changes: null,
        outcome: "unchanged",
        snapshot: {
          content: current.content,
          revision: current.revision,
        },
        status: "synchronized",
      };
    }
    try {
      const receipt = await store.commit({
        baseRevision: current.revision,
        content: desired.content,
        projection: desired.projection,
      });

      return {
        changes: projectChanges({
          after: receipt.after,
          before: receipt.before,
          timestamp,
        }),
        outcome: direct ? "committed" : "auto-merged",
        snapshot: {
          content: receipt.after.content,
          revision: receipt.revision,
        },
        status: "synchronized",
      };
    } catch (error) {
      if (!(error instanceof SnapshotSyncRevisionConflictError)) throw error;
      latestRevision = error.currentRevision;
    }
  }
  throw new SnapshotSyncRetryExhaustedError(latestRevision);
}
