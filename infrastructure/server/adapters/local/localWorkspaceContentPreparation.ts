// SPDX-License-Identifier: GPL-3.0-or-later

import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import {
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";

export function prepareLocalWorkspaceWriteContent(
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
