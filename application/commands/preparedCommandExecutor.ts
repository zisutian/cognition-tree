// SPDX-License-Identifier: GPL-3.0-or-later

import type { DomainChangeSet } from "../../core/sync/domainChangeSet.ts";
import type { DomainTextEdit } from "../../core/sync/domainTransition.ts";

export type CommandExecutionMode = "commit" | "preview";

export type PreparedCommandSnapshot<
  Content,
  Projection,
  Revision extends string,
> = Readonly<{
  content: Content;
  projection: Projection;
  revision: Revision;
}>;

export type PreparedCommandTransaction<
  Content,
  Projection,
  Revision extends string,
> = Readonly<{
  baseRevision: Revision;
  content: Content;
  projection: Projection;
}>;

export type PreparedCommandStore<
  Content,
  Projection,
  Revision extends string,
> = {
  commit(
    transaction: PreparedCommandTransaction<Content, Projection, Revision>,
  ): Promise<{ revision: Revision }>;
  isRevisionConflict(error: unknown): boolean;
  load(): Promise<PreparedCommandSnapshot<Content, Projection, Revision>>;
};

export type PreparedCommand<
  Content,
  Projection,
  Outcome,
  Revision extends string,
> = Readonly<{
  changes: DomainChangeSet;
  content: Content;
  diff: DomainTextEdit[];
  projection: Projection;
  result: Outcome;
  revision: Revision;
}>;

export type CommandExecutionResult<Outcome, Revision extends string> =
  | Readonly<{
      changes: DomainChangeSet;
      diff: DomainTextEdit[];
      result: Outcome;
      revision: Revision;
      status: "previewed";
    }>
  | Readonly<{
      changes: DomainChangeSet;
      result: Outcome;
      revision: Revision;
      status: "committed";
    }>;

export async function executePreparedCommand<
  Content,
  Projection,
  Outcome,
  Revision extends string,
>({
  mode,
  prepare,
  store,
}: {
  mode: CommandExecutionMode;
  prepare(
    snapshot: PreparedCommandSnapshot<Content, Projection, Revision>,
  ): PreparedCommand<Content, Projection, Outcome, Revision>;
  store: PreparedCommandStore<Content, Projection, Revision>;
}): Promise<CommandExecutionResult<Outcome, Revision>> {
  const maximumAttempts = mode === "commit" ? 3 : 1;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const snapshot = await store.load();
    const prepared = prepare(snapshot);

    if (mode === "preview") {
      return {
        changes: prepared.changes,
        diff: prepared.diff,
        result: prepared.result,
        revision: prepared.revision,
        status: "previewed",
      };
    }
    try {
      const committed = await store.commit({
        baseRevision: snapshot.revision,
        content: prepared.content,
        projection: prepared.projection,
      });

      return {
        changes: prepared.changes,
        result: prepared.result,
        revision: committed.revision,
        status: "committed",
      };
    } catch (error) {
      if (
        store.isRevisionConflict(error) &&
        attempt + 1 < maximumAttempts
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Command retry loop exhausted unexpectedly.");
}
