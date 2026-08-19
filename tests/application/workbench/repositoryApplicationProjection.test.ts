// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  projectBuiltInSessionSummary,
  projectWorkspaceRepositorySessionSummary,
} from "../../../application/workbench/repositoryApplicationProjection";

const conflictActions = {
  discardPendingChangesAndReload: vi.fn(async () => undefined),
  keepLocalConflictAndSynchronize: vi.fn(async () => undefined),
  loadConflictUnitIds: vi.fn(async () => ["unit-1"]),
  recoverLocalConflictCopy: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
  useRemoteConflictAndSynchronize: vi.fn(async () => undefined),
};

describe("workbench repository application projection", () => {
  it("normalizes Workspace session state without exposing domain content", () => {
    expect(projectWorkspaceRepositorySessionSummary({
      ...conflictActions,
      state: {
        persistence: {
          remoteRevision: "sha256:remote",
          status: "conflict",
        },
        status: "ready",
        storageLabel: "本地仓库",
      },
    })).toEqual({
      ...conflictActions,
      persistence: {
        remoteRevision: "sha256:remote",
        status: "conflict",
      },
      status: "ready",
      storageLabel: "本地仓库",
    });
  });

  it("normalizes built-in failures and ready persistence independently", () => {
    expect(projectBuiltInSessionSummary({
      ...conflictActions,
      requestSync: vi.fn(),
      state: {
        errorMessage: "journal failed",
        status: "failed",
        storageLabel: "Journal",
      },
    })).toEqual({
      errorMessage: "journal failed",
      reload: conflictActions.reload,
      status: "failed",
    });

    const requestSync = vi.fn();

    expect(projectBuiltInSessionSummary({
      ...conflictActions,
      requestSync,
      state: {
        persistence: { status: "saved" },
        status: "ready",
        storageLabel: "Journal",
      },
    })).toEqual({
      ...conflictActions,
      persistence: { status: "saved" },
      requestSync,
      status: "ready",
    });
  });
});
