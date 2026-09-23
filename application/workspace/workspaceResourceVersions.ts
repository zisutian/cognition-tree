// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceResourceVersionPolicy } from "./commands/workspaceCommandPreparation.ts";

export function createWorkspaceResourceVersions(
  digest: (value: unknown) => `sha256:${string}`,
): WorkspaceResourceVersionPolicy {
  return {
    folder: (folderId, title) => digest({ folderId, title }),
    note: (source) => digest({ source }),
    tree: (_content, workspace) => digest({
      tree: workspace.tree,
      workspaceId: workspace.id,
    }),
  };
}
