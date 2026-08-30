// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createRepositoryProjection,
  projectBuiltInSessionSummary,
  projectWorkspaceRepositorySessionSummary,
} from "../../../application/workbench/repositoryApplicationProjection";
import type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
} from "../../../application/workbench/workbenchController";
import type { RepositoryNavigation } from
  "../../../application/repository/repositoryNavigation";

const conflictActions = {
  discardPendingChangesAndReload: vi.fn(async () => undefined),
  keepLocalConflictAndSynchronize: vi.fn(async () => undefined),
  loadConflictDetails: vi.fn(async () => ({
    remoteRevision: "sha256:remote",
    unitIds: ["unit-1"],
  })),
  recoverLocalConflictCopy: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
  useRemoteConflictAndSynchronize: vi.fn(async () => undefined),
};

describe("workbench repository application projection", () => {
  it("does not read Workspace domain commands while projecting an absent session", () => {
    const workspace = {
      ...conflictActions,
      get commands(): never {
        throw new Error("Workspace domain commands must remain unread.");
      },
    };
    const controller = {
      createRepository: vi.fn(),
      deleteRepository: vi.fn(),
      journal: { ...conflictActions, requestSync: vi.fn() },
      reloadBuiltIns: vi.fn(),
      refreshRepositories: vi.fn(),
      renameRepository: vi.fn(),
      retryBuiltIn: vi.fn(),
      selectRepository: vi.fn(),
      todo: { ...conflictActions, requestSync: vi.fn() },
      workspace,
    } as unknown as WorkbenchController;
    const snapshot = {
      builtIns: {
        catalog: {
          catalogLabel: "Built-ins",
          state: { status: "loading" },
        },
        journal: { state: { status: "unavailable" } },
        todo: { state: { status: "unavailable" } },
      },
      catalog: {
        activeDescriptor: null,
        catalogLabel: "Repositories",
        state: { status: "loading" },
      },
      workspace: { status: "absent" },
    } as unknown as WorkbenchControllerSnapshot;
    const navigation = {
      consumeFocusRequest: vi.fn(),
      focusBuiltIn: vi.fn(),
      focusCatalog: vi.fn(),
      focusOrdinaryIssue: vi.fn(),
      focusOrdinaryRepository: vi.fn(),
      focusRequest: null,
    } satisfies RepositoryNavigation;

    expect(createRepositoryProjection(
      controller,
      snapshot,
      navigation,
    ).session).toEqual({ status: "absent" });
  });

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
