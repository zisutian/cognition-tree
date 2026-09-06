import type { RepositoryApplication } from "./repositoryApplication.ts";

export type WorkspaceRepositoryRuntimeIssue =
  | {
      code: "repository_catalog_failed";
      kind: "catalog";
      message: string;
    }
  | {
      code:
        | "repository_conflict"
        | "repository_persistence_error"
        | "session_load_failed";
      kind: "repository";
      message: string;
      repositoryId: string;
      repositoryLabel: string;
    };

export function projectWorkspaceRepositoryRuntimeIssues(
  source: Pick<
    RepositoryApplication,
    "activeDescriptor" | "catalogState" | "session"
  >,
): WorkspaceRepositoryRuntimeIssue[] {
  const projected: WorkspaceRepositoryRuntimeIssue[] = [];

  if (source.catalogState.status === "failed") {
    return [{
      code: "repository_catalog_failed",
      kind: "catalog",
      message: source.catalogState.errorMessage,
    }];
  }
  if (source.catalogState.status !== "ready") {
    return projected;
  }

  const descriptor = source.activeDescriptor;

  if (!descriptor) {
    return projected;
  }
  if (source.session.status === "failed") {
    projected.push({
      code: "session_load_failed",
      kind: "repository",
      message: source.session.errorMessage,
      repositoryId: descriptor.id,
      repositoryLabel: descriptor.label,
    });
    return projected;
  }
  if (source.session.status !== "ready") {
    return projected;
  }
  if (source.session.persistence.status === "conflict") {
    projected.push({
      code: "repository_conflict",
      kind: "repository",
      message:
        "普通仓库存在同步冲突，本地与远端版本均已保留，请选择处理方式。",
      repositoryId: descriptor.id,
      repositoryLabel: descriptor.label,
    });
  } else if (source.session.persistence.status === "error") {
    projected.push({
      code: "repository_persistence_error",
      kind: "repository",
      message: source.session.persistence.message,
      repositoryId: descriptor.id,
      repositoryLabel: descriptor.label,
    });
  }

  return projected;
}
