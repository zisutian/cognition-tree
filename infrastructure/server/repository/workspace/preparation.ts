// SPDX-License-Identifier: GPL-3.0-or-later

import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/index.ts";
import {
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/index.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/index.ts";

export function prepareWorkspaceWriteContent(
  content: WorkspaceRepositoryContentDto,
  previous?: WorkspaceRepositoryPreparation | null,
) {
  try {
    return prepareWorkspaceRepositoryContent(content, { previous });
  } catch (error) {
    throw new WorkspaceRepositoryContractError(
      "$.content",
      error instanceof Error ? error.message : "invalid workspace content",
    );
  }
}
