// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  projectBuiltInCatalogFailure,
  projectBuiltInRuntimeIssues,
} from "../../../application/repository/projectBuiltInIssues";
import type { BuiltInSessionSummary } from "../../../application/repository/repositoryApplication";

const repositories = [
  {
    id: "journal" as const,
    label: "日记" as const,
    location: { serverPath: "/data/journal", type: "server" as const },
    protected: true as const,
  },
  {
    id: "todo" as const,
    label: "代办" as const,
    location: { serverPath: "/data/todo", type: "server" as const },
    protected: true as const,
  },
];

describe("built-in data runtime issue projection", () => {
  it("preserves a failed catalog as one retryable catalog problem", () => {
    expect(projectBuiltInCatalogFailure("无法读取内置数据目录。")).toEqual({
      code: "built_in_catalog_failed",
      kind: "catalog",
      message: "无法读取内置数据目录。",
      status: "fault",
    });
  });

  it("adds independent session failures without duplicating catalog faults", () => {
    const sessions: Record<"journal" | "todo", BuiltInSessionSummary> = {
      journal: { errorMessage: "journal session failed", reload: async () => {}, status: "failed" },
      todo: { errorMessage: "todo session failed", reload: async () => {}, status: "failed" },
    };

    expect(projectBuiltInRuntimeIssues({
      issues: [{
        code: "repository_corrupt",
        id: "journal",
        location: null,
        message: "journal catalog fault",
        status: "fault",
      }],
      repositories,
      sessions,
    })).toEqual([
      expect.objectContaining({
        id: "journal",
        kind: "data",
        message: "journal catalog fault",
      }),
      {
        code: "session_load_failed",
        id: "todo",
        kind: "data",
        location: { serverPath: "/data/todo", type: "server" },
        message: "todo session failed",
        status: "fault",
      },
    ]);
  });

  it("exposes ready-session conflicts and persistence errors independently", () => {
    expect(projectBuiltInRuntimeIssues({
      issues: [],
      repositories,
      sessions: {
        journal: {
          discardPendingChangesAndReload: async () => {},
          keepLocalConflictAndSynchronize: async () => {},
          loadConflictDetails: async () => ({
            remoteRevision: `sha256:${"a".repeat(64)}`,
            unitIds: [],
          }),
          persistence: {
            remoteRevision: `sha256:${"a".repeat(64)}`,
            status: "conflict",
          },
          recoverLocalConflictCopy: async () => {},
          reload: async () => {},
          requestSync: () => {},
          status: "ready",
          useRemoteConflictAndSynchronize: async () => {},
        },
        todo: {
          discardPendingChangesAndReload: async () => {},
          keepLocalConflictAndSynchronize: async () => {},
          loadConflictDetails: async () => ({
            remoteRevision: `sha256:${"a".repeat(64)}`,
            unitIds: [],
          }),
          persistence: {
            localCopySafe: true,
            message: "todo synchronization failed",
            phase: "sync",
            status: "error",
          },
          recoverLocalConflictCopy: async () => {},
          reload: async () => {},
          requestSync: () => {},
          status: "ready",
          useRemoteConflictAndSynchronize: async () => {},
        },
      },
    })).toEqual([
      expect.objectContaining({
        code: "repository_conflict",
        id: "journal",
        kind: "data",
      }),
      expect.objectContaining({
        code: "repository_persistence_error",
        id: "todo",
        kind: "data",
        message: "todo synchronization failed",
      }),
    ]);
  });
});
