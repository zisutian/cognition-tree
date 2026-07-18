import type {
  RepositoryAdapterKind,
  WorkspaceRepositoryCatalogIssue,
} from "../../../storage/repository/workspaceRepositoryCatalog";

export const repositoryAdapterLabels: Record<RepositoryAdapterKind, string> = {
  browser: "浏览器",
  local: "本地",
  webdav: "WebDAV",
};

export const unsupportedLocalRepositoryMessage =
  "仓库格式不受支持，需要手工删除该目录。";

export function requiresManualLocalDeletion(
  issue: Pick<
    WorkspaceRepositoryCatalogIssue,
    "adapter" | "code"
  >,
) {
  return issue.adapter === "local" &&
    issue.code === "unsupported_repository_version";
}

export function projectRepositoryIssueMessage(
  issue: Pick<
    WorkspaceRepositoryCatalogIssue,
    "adapter" | "code" | "message"
  >,
) {
  return requiresManualLocalDeletion(issue)
    ? unsupportedLocalRepositoryMessage
    : issue.message;
}
