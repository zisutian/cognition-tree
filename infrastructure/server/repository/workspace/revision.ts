// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeWorkspaceRepositoryRevisionContent } from "../../../../contracts/workspace/index.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/index.ts";

export function createWorkspaceRepositoryRevision(
  content: WorkspaceRepositoryContentDto,
) {
  return `sha256:${createHash("sha256")
    .update(serializeWorkspaceRepositoryRevisionContent(content))
    .digest("hex")}` as const;
}
