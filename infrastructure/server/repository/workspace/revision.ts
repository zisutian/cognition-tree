// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeWorkspaceRepositoryRevisionContent } from "../../../../contracts/workspace/revision.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types.ts";

export function createWorkspaceRepositoryRevision(
  content: WorkspaceRepositoryContentDto,
) {
  return `sha256:${createHash("sha256")
    .update(serializeWorkspaceRepositoryRevisionContent(content))
    .digest("hex")}` as const;
}
