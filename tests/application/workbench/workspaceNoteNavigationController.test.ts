// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { RepositoryCatalogControllerSnapshot } from "../../../application/repository/repositoryCatalogController";
import {
  createWorkspaceNoteNavigationController,
} from "../../../application/workbench/workspaceNoteNavigationController";

const destination = {
  blockId: null,
  domain: "workspace" as const,
  repositoryId: "repository-b",
  resourceId: "note-1",
};

const descriptor = {
  adapter: "local" as const,
  id: "repository-b",
  label: "仓库B",
  labelIssue: null,
  location: {
    hostPath: null,
    serverPath: "/repositories/b",
    type: "local" as const,
  },
};

function readyCatalog(
  activeRepositoryId: string | null,
): RepositoryCatalogControllerSnapshot {
  return {
    activeDescriptor: activeRepositoryId === descriptor.id ? descriptor : null,
    catalogLabel: "Repositories",
    state: {
      activeRepositoryId,
      creatableAdapters: ["local"],
      issues: [],
      operation: "idle",
      repositories: [descriptor],
      status: "ready",
    },
  };
}

describe("workspace note navigation controller", () => {
  it("waits for catalog input and reports a missing repository", () => {
    let catalog: RepositoryCatalogControllerSnapshot = {
      activeDescriptor: null,
      catalogLabel: "Repositories",
      state: { status: "loading" },
    };
    const controller = createWorkspaceNoteNavigationController({
      flushWorkspace: vi.fn(async () => undefined),
      getCatalog: () => catalog,
      getWorkspace: () => ({ status: "absent" }),
      onChange: vi.fn(),
      selectRepository: vi.fn(),
    });
    const requestId = controller.request(destination);

    expect(controller.getState()).toEqual({
      destination,
      requestId,
      status: "pending",
    });
    catalog = {
      ...readyCatalog(null),
      state: {
        ...readyCatalog(null).state,
        repositories: [],
      } as RepositoryCatalogControllerSnapshot["state"],
    };
    controller.notifyInputsChanged();

    expect(controller.getState()).toMatchObject({
      errorMessage: "引用目标仓库不存在。",
      requestId,
      status: "failed",
    });
  });

  it("flushes before selection and waits for the mounted target session", async () => {
    let catalog = readyCatalog(null);
    let workspace:
      | { status: "loading" }
      | { status: "ready" } = { status: "ready" };
    const events: string[] = [];
    const controller = createWorkspaceNoteNavigationController({
      async flushWorkspace() {
        events.push("flush");
      },
      getCatalog: () => catalog,
      getWorkspace: () => workspace,
      onChange: vi.fn(),
      async selectRepository() {
        events.push("select");
        catalog = readyCatalog(descriptor.id);
        workspace = { status: "loading" };
      },
    });

    controller.request(destination);
    await vi.waitFor(() => expect(events).toEqual(["flush", "select"]));
    expect(controller.getState().status).toBe("pending");

    workspace = { status: "ready" };
    controller.notifyInputsChanged();
    await vi.waitFor(() =>
      expect(controller.getState().status).toBe("ready")
    );
  });

  it("observes a target session that becomes ready during selection", async () => {
    let catalog = readyCatalog(null);
    let workspace:
      | { status: "loading" }
      | { status: "ready" }
      = { status: "loading" };
    const controller = createWorkspaceNoteNavigationController({
      flushWorkspace: vi.fn(async () => undefined),
      getCatalog: () => catalog,
      getWorkspace: () => workspace,
      onChange: vi.fn(),
      async selectRepository() {
        catalog = readyCatalog(descriptor.id);
        workspace = { status: "ready" };
      },
    });

    controller.request(destination);
    await vi.waitFor(() =>
      expect(controller.getState().status).toBe("ready")
    );
  });
});
