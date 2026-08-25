// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryCatalogIssue } from
  "./workspaceRepositoryCatalog";

export const unsupportedLocalRepositoryMessage =
  "仓库格式不受支持，需要手工删除该目录。";

export function requiresManualLocalDeletion(
  issue: Pick<WorkspaceRepositoryCatalogIssue, "code">,
) {
  return issue.code === "unsupported_repository_version";
}

export function projectRepositoryIssueMessage(
  issue: Pick<
    WorkspaceRepositoryCatalogIssue,
    "code" | "message"
  >,
) {
  return requiresManualLocalDeletion(issue)
    ? unsupportedLocalRepositoryMessage
    : issue.message;
}
