// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedCommandStore,
} from "../../../application/commands/preparedCommandExecutor.ts";

type PreparedContentStore<Content, Projection, Revision extends string> = {
  commitPreparedSnapshot(
    commit: { baseRevision: Revision; content: Content },
    projection: Projection,
  ): Promise<{ revision: Revision }>;
  loadSnapshot(): Promise<{
    content: Content;
    projection: Projection;
    revision: Revision;
  }>;
};

export function createPreparedCommandStoreAdapter<
  Content,
  Projection,
  Revision extends string,
>(
  store: PreparedContentStore<Content, Projection, Revision>,
  isRevisionConflict: (error: unknown) => boolean,
): PreparedCommandStore<Content, Projection, Revision> {
  return {
    commit({ baseRevision, content, projection }) {
      return store.commitPreparedSnapshot(
        { baseRevision, content },
        projection,
      );
    },
    isRevisionConflict,
    load: () => store.loadSnapshot(),
  };
}
