// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceContentDestination,
} from "../navigation/contentDestination";
import type { RepositoryCatalogControllerSnapshot } from "../repository/repositoryCatalogController";

type NavigationWorkspaceSession =
  | { status: "absent" | "loading" }
  | { errorMessage: string; status: "failed" }
  | { status: "ready" };

export type WorkbenchNavigationState =
  | { status: "idle" }
  | {
      destination: WorkspaceContentDestination;
      requestId: number;
      status: "pending" | "ready";
    }
  | {
      destination: WorkspaceContentDestination;
      errorMessage: string;
      requestId: number;
      status: "failed";
    };

export type WorkspaceNoteNavigationController = {
  consume(requestId: number): void;
  dispose(): void;
  getState(): WorkbenchNavigationState;
  notifyInputsChanged(): void;
  request(destination: WorkspaceContentDestination): number;
  retry(requestId: number): void;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function createWorkspaceNoteNavigationController({
  flushWorkspace,
  getCatalog,
  getWorkspace,
  onChange,
  selectRepository,
}: {
  flushWorkspace(): Promise<void>;
  getCatalog(): RepositoryCatalogControllerSnapshot;
  getWorkspace(): NavigationWorkspaceSession;
  onChange(): void;
  selectRepository(repositoryId: string): Promise<void>;
}): WorkspaceNoteNavigationController {
  let disposed = false;
  let nextRequestId = 1;
  let processing = false;
  let state: WorkbenchNavigationState = { status: "idle" };

  const publish = (nextState: WorkbenchNavigationState) => {
    if (disposed) return;
    state = nextState;
    onChange();
  };
  const isCurrentPendingRequest = (requestId: number) =>
    !disposed &&
    state.status === "pending" &&
    state.requestId === requestId;
  const process = async () => {
    if (processing || state.status !== "pending" || disposed) return;
    const request = state;
    const catalog = getCatalog();

    if (catalog.state.status === "loading") return;
    if (catalog.state.status === "failed") {
      publish({
        ...request,
        errorMessage: catalog.state.errorMessage,
        status: "failed",
      });
      return;
    }
    if (!catalog.state.repositories.some(({ id }) =>
      id === request.destination.repositoryId
    )) {
      publish({
        ...request,
        errorMessage: "引用目标仓库不存在。",
        status: "failed",
      });
      return;
    }

    processing = true;
    try {
      if (catalog.activeDescriptor?.id !== request.destination.repositoryId) {
        const workspace = getWorkspace();

        if (workspace.status === "ready") {
          await flushWorkspace();
          if (!isCurrentPendingRequest(request.requestId)) return;
        }
        if (!isCurrentPendingRequest(request.requestId)) return;
        await selectRepository(request.destination.repositoryId);
      } else {
        const workspace = getWorkspace();

        if (workspace.status === "ready") {
          publish({ ...request, status: "ready" });
        } else if (workspace.status === "failed") {
          publish({
            ...request,
            errorMessage: workspace.errorMessage,
            status: "failed",
          });
        }
      }
    } catch (error) {
      if (state.requestId === request.requestId) {
        publish({
          ...request,
          errorMessage: errorMessage(error, "无法打开日记引用目标。"),
          status: "failed",
        });
      }
    } finally {
      processing = false;
      if (disposed || state.status !== "pending") return;
      if (state.requestId !== request.requestId) {
        void process();
        return;
      }
      if (
        getCatalog().activeDescriptor?.id !== state.destination.repositoryId
      ) {
        return;
      }
      const workspace = getWorkspace();

      if (workspace.status === "ready" || workspace.status === "failed") {
        void process();
      }
    }
  };

  return {
    consume(requestId) {
      if (state.status !== "idle" && state.requestId === requestId) {
        publish({ status: "idle" });
      }
    },
    dispose() {
      disposed = true;
    },
    getState: () => state,
    notifyInputsChanged() {
      void process();
    },
    request(destination) {
      const requestId = nextRequestId++;

      publish({ destination, requestId, status: "pending" });
      void process();
      return requestId;
    },
    retry(requestId) {
      if (state.status === "failed" && state.requestId === requestId) {
        publish({
          destination: state.destination,
          requestId,
          status: "pending",
        });
        void process();
      }
    },
  };
}
