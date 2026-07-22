import type {
  SystemRepositoryDescriptor,
  SystemRepositoryIssue,
  SystemRepositoryPurpose,
} from "../../storage/repository/systemRepository";
import type { SystemRepositorySession } from "./useSystemRepositorySession";

export type SystemRepositoryRuntimeIssue = Omit<SystemRepositoryIssue, "code"> & {
  code:
    | SystemRepositoryIssue["code"]
    | "repository_conflict"
    | "repository_persistence_error"
    | "session_load_failed"
    | "system_repository_catalog_failed";
};

export function projectSystemRepositoryCatalogFailure(
  errorMessage: string,
): SystemRepositoryRuntimeIssue {
  return {
    code: "system_repository_catalog_failed",
    id: "system-journal",
    location: null,
    message: errorMessage,
    status: "fault",
  };
}

export function projectSystemRepositoryRuntimeIssues({
  issues,
  repositories,
  sessions,
}: {
  issues: SystemRepositoryIssue[];
  repositories: SystemRepositoryDescriptor[];
  sessions: Record<
    SystemRepositoryPurpose,
    Pick<SystemRepositorySession, "state">
  >;
}): SystemRepositoryRuntimeIssue[] {
  const projected: SystemRepositoryRuntimeIssue[] = [...issues];
  const issuePurposes = new Set(issues.map(({ id }) => id));

  for (const descriptor of repositories) {
    if (issuePurposes.has(descriptor.id)) {
      continue;
    }
    const state = sessions[descriptor.id].state;

    if (state.status === "failed") {
      projected.push({
        code: "session_load_failed",
        id: descriptor.id,
        location: descriptor.location,
        message: state.errorMessage,
        status: "fault",
      });
      continue;
    }
    if (state.status !== "ready") {
      continue;
    }
    if (state.persistence.status === "conflict") {
      projected.push({
        code: "repository_conflict",
        id: descriptor.id,
        location: descriptor.location,
        message: "内置仓库存在同步冲突，请放弃本地修改并重新加载。",
        status: "fault",
      });
    } else if (state.persistence.status === "error") {
      projected.push({
        code: "repository_persistence_error",
        id: descriptor.id,
        location: descriptor.location,
        message: state.persistence.message,
        status: "fault",
      });
    }
  }

  return projected;
}
