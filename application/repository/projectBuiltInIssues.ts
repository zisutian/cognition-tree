// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInDescriptor,
  BuiltInIssue,
} from "./builtInRepository";
import type { BuiltInSessionSummary } from "./repositoryApplication";

export type BuiltInRuntimeIssue =
  | {
      code: "built_in_catalog_failed";
      kind: "catalog";
      message: string;
      status: "fault";
    }
  | (Omit<BuiltInIssue, "code"> & {
      code:
        | BuiltInIssue["code"]
        | "repository_conflict"
        | "repository_persistence_error"
        | "session_load_failed";
      kind: "data";
    });

export function projectBuiltInCatalogFailure(
  errorMessage: string,
): BuiltInRuntimeIssue {
  return {
    code: "built_in_catalog_failed",
    kind: "catalog",
    message: errorMessage,
    status: "fault",
  };
}

export function projectBuiltInRuntimeIssues({
  issues,
  repositories,
  sessions,
}: {
  issues: BuiltInIssue[];
  repositories: BuiltInDescriptor[];
  sessions: Record<BuiltInDescriptor["id"], BuiltInSessionSummary>;
}): BuiltInRuntimeIssue[] {
  const projected: BuiltInRuntimeIssue[] = issues.map((issue) => ({
    ...issue,
    kind: "data",
  }));
  const issueIds = new Set(issues.map(({ id }) => id));

  for (const descriptor of repositories) {
    if (issueIds.has(descriptor.id)) continue;
    const state = sessions[descriptor.id];

    if (state.status === "failed") {
      projected.push({
        code: "session_load_failed",
        id: descriptor.id,
        kind: "data",
        location: descriptor.location,
        message: state.errorMessage,
        status: "fault",
      });
      continue;
    }
    if (state.status !== "ready") continue;
    if (state.persistence.status === "conflict") {
      projected.push({
        code: "repository_conflict",
        id: descriptor.id,
        kind: "data",
        location: descriptor.location,
        message:
          "内置数据存在同步冲突，本地与远端版本均已保留，请选择处理方式。",
        status: "fault",
      });
    } else if (state.persistence.status === "error") {
      projected.push({
        code: "repository_persistence_error",
        id: descriptor.id,
        kind: "data",
        location: descriptor.location,
        message: state.persistence.message,
        status: "fault",
      });
    }
  }
  return projected;
}
