// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceRepositoryCommitDto,
} from "../../../../../contracts/workspace/types.ts";
import type {
  WorkspaceRepositoryStore,
} from "../../../../../infrastructure/server/repository/store.ts";
import {
  prepareWorkspaceWriteContent,
} from "../../../../../infrastructure/server/repository/workspace/preparation.ts";

export async function prepareAndCommitWorkspaceContent(
  store: WorkspaceRepositoryStore,
  commit: WorkspaceRepositoryCommitDto,
) {
  const current = await store.loadSnapshot();

  return store.commit({
    ...commit,
    projection: prepareWorkspaceWriteContent(
      commit.content,
      current.projection,
    ),
  });
}
