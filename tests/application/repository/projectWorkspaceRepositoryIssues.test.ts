import { describe, expect, it } from "vitest";
import { projectWorkspaceRepositoryRuntimeIssues } from "../../../application/repository/projectWorkspaceRepositoryIssues";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";

const descriptor = {
  adapter: "local" as const,
  id: "primary",
  label: "主要笔记",
  labelIssue: null,
  location: {
    hostPath: null,
    serverPath: "/data/repositories/primary",
    type: "local" as const,
  },
};

function source(
  session: RepositoryApplication["session"],
): Pick<
  RepositoryApplication,
  "activeDescriptor" | "catalogState" | "session"
> {
  return {
    activeDescriptor: descriptor,
    catalogState: {
      activeRepositoryId: descriptor.id,
      creatableAdapters: ["local"],
      issues: [],
      operation: "idle",
      repositories: [descriptor],
      status: "ready",
    },
    session,
  };
}

describe("ordinary repository runtime issue projection", () => {
  it("preserves catalog and active-session load failures", () => {
    expect(projectWorkspaceRepositoryRuntimeIssues({
      activeDescriptor: null,
      catalogState: {
        errorMessage: "无法读取普通仓库目录。",
        status: "failed",
      },
      session: { status: "absent" },
    })).toEqual([{
      code: "repository_catalog_failed",
      kind: "catalog",
      message: "无法读取普通仓库目录。",
    }]);

    expect(projectWorkspaceRepositoryRuntimeIssues(source({
      errorMessage: "仓库索引损坏。",
      retry: async () => undefined,
      status: "failed",
      storageLabel: "本地仓库",
    }))).toEqual([{
      adapter: "local",
      code: "session_load_failed",
      kind: "repository",
      message: "仓库索引损坏。",
      repositoryId: "primary",
      repositoryLabel: "主要笔记",
    }]);
  });

  it("prefers the recoverable catalog target over a stale active descriptor", () => {
    const failedSession = source({
      errorMessage: "旧活动仓库也无法载入。",
      retry: async () => undefined,
      status: "failed",
      storageLabel: "本地仓库",
    });

    expect(projectWorkspaceRepositoryRuntimeIssues({
      ...failedSession,
      catalogState: {
        errorMessage: "无法读取普通仓库目录。",
        status: "failed",
      },
    })).toEqual([{
      code: "repository_catalog_failed",
      kind: "catalog",
      message: "无法读取普通仓库目录。",
    }]);
  });

  it("projects conflict and persistence errors without inventing document diagnostics", () => {
    expect(projectWorkspaceRepositoryRuntimeIssues(source({
      discardPendingChangesAndReload: async () => undefined,
      persistence: {
        remoteRevision: "sha256:remote",
        status: "conflict",
      },
      reload: async () => undefined,
      status: "ready",
      storageLabel: "本地仓库",
    }))).toEqual([
      expect.objectContaining({
        code: "repository_conflict",
        kind: "repository",
        repositoryId: "primary",
      }),
    ]);

    expect(projectWorkspaceRepositoryRuntimeIssues(source({
      discardPendingChangesAndReload: async () => undefined,
      persistence: {
        localCopySafe: false,
        message: "无法保存本地副本。",
        phase: "local",
        status: "error",
      },
      reload: async () => undefined,
      status: "ready",
      storageLabel: "本地仓库",
    }))).toEqual([
      expect.objectContaining({
        code: "repository_persistence_error",
        message: "无法保存本地副本。",
        repositoryId: "primary",
      }),
    ]);
  });
});
