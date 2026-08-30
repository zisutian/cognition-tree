// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { RepositoryCatalogControllerSnapshot } from "../../../application/repository/repositoryCatalogController";
import {
  createWorkspaceNoteNavigationController,
} from "../../../application/workbench/workspaceNoteNavigationController";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

const destination = {
  blockId: null,
  domain: "workspace" as const,
  repositoryId: "repository-b",
  resourceId: "note-1",
};

const descriptor = {
  id: "repository-b",
  label: "仓库B",
  labelIssue: null,
  location: {
    hostPath: null,
    serverPath: "/repositories/b",
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

  it("does not select for a request replaced while its flush is pending", async () => {
    const pendingFlush = deferred<void>();
    const replacementDestination = {
      ...destination,
      repositoryId: "repository-c",
    };
    const repositoryC = {
      ...descriptor,
      id: replacementDestination.repositoryId,
      label: "仓库C",
    };
    let catalog: RepositoryCatalogControllerSnapshot = {
      ...readyCatalog(null),
      state: {
        ...readyCatalog(null).state,
        repositories: [descriptor, repositoryC],
      } as RepositoryCatalogControllerSnapshot["state"],
    };
    const selectRepository = vi.fn(async (repositoryId: string) => {
      catalog = {
        activeDescriptor: repositoryId === descriptor.id
          ? descriptor
          : repositoryC,
        catalogLabel: "Repositories",
        state: {
          activeRepositoryId: repositoryId,
          issues: [],
          operation: "idle",
          repositories: [descriptor, repositoryC],
          status: "ready",
        },
      };
    });
    const controller = createWorkspaceNoteNavigationController({
      flushWorkspace: () => pendingFlush.promise,
      getCatalog: () => catalog,
      getWorkspace: () => ({ status: "ready" }),
      onChange: vi.fn(),
      selectRepository,
    });

    controller.request(destination);
    controller.request(replacementDestination);
    pendingFlush.resolve();

    await vi.waitFor(() => expect(selectRepository).toHaveBeenCalledOnce());
    expect(selectRepository).toHaveBeenCalledWith(
      replacementDestination.repositoryId,
    );
    await vi.waitFor(() =>
      expect(controller.getState()).toMatchObject({
        destination: replacementDestination,
        status: "ready",
      })
    );
  });

  it("does not select after disposal during a pending flush", async () => {
    const pendingFlush = deferred<void>();
    const selectRepository = vi.fn();
    const controller = createWorkspaceNoteNavigationController({
      flushWorkspace: () => pendingFlush.promise,
      getCatalog: () => readyCatalog(null),
      getWorkspace: () => ({ status: "ready" }),
      onChange: vi.fn(),
      selectRepository,
    });

    controller.request(destination);
    controller.dispose();
    pendingFlush.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(selectRepository).not.toHaveBeenCalled();
  });
});
