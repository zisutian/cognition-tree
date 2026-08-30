// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryProvider } from "../workspace/persistence/workspaceRepositoryProvider";
import type { WorkspaceRepositoryDescriptor } from "../repository/workspaceRepositoryCatalog";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type { SessionCommandDependencies } from "../workspace/session/sessionCommands";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../workspace/session/workspaceSessionController";

export type WorkbenchWorkspaceSession =
  | { status: "absent" }
  | WorkspaceSessionControllerState;

export type WorkspaceSessionSlot = {
  dispose(): void;
  flushReady(): Promise<void>;
  getController(): WorkspaceSessionController | null;
  getSnapshot(): WorkbenchWorkspaceSession;
  reconcile(descriptor: WorkspaceRepositoryDescriptor | null): void;
  start(): void;
  synchronizeReady(): Promise<void>;
};

export function createWorkspaceSessionSlot({
  commandDependencies,
  onChange,
  repositories,
  scheduler,
}: {
  commandDependencies: SessionCommandDependencies;
  onChange(): void;
  repositories: WorkspaceRepositoryProvider;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): WorkspaceSessionSlot {
  let controller: WorkspaceSessionController | null = null;
  let connectionKey = "";
  let disposed = false;
  let started = false;
  let state: WorkspaceSessionControllerState | null = null;
  let unsubscribe: (() => void) | null = null;

  const releaseController = (
    ownedController: WorkspaceSessionController | null,
    ownedUnsubscribe: (() => void) | null,
  ) => {
    try {
      ownedUnsubscribe?.();
    } finally {
      ownedController?.dispose();
    }
  };

  const clearController = () => {
    const previousController = controller;
    const previousUnsubscribe = unsubscribe;

    controller = null;
    state = null;
    unsubscribe = null;
    releaseController(previousController, previousUnsubscribe);
  };
  const requireController = () => {
    if (!controller) {
      throw new Error("Workspace session controller is unavailable.");
    }
    return controller;
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearController();
      connectionKey = "";
    },
    async flushReady() {
      if (state?.status === "ready") {
        await requireController().flushPendingChanges();
      }
    },
    getController: () => controller,
    getSnapshot: () =>
      controller && state ? state : { status: "absent" },
    reconcile(descriptor) {
      const nextConnectionKey = descriptor
        ? JSON.stringify({
            id: descriptor.id,
            location: descriptor.location,
          })
        : "";

      if (
        disposed ||
        (nextConnectionKey === connectionKey &&
          (controller !== null || descriptor === null))
      ) {
        return;
      }
      if (!descriptor) {
        clearController();
        connectionKey = "";
        return;
      }
      const repository = repositories.openRepository(descriptor);

      const nextController = createWorkspaceSessionController({
        commandDependencies,
        repository,
        scheduler,
      });
      let nextState: WorkspaceSessionControllerState;
      let nextUnsubscribe: () => void = () => undefined;

      try {
        nextState = nextController.getState();
        nextUnsubscribe = nextController.subscribe(() => {
          const publishedState = nextController.getState();

          if (controller !== nextController) {
            nextState = publishedState;
            return;
          }
          state = publishedState;
          onChange();
        });
        if (started) nextController.start();
      } catch (error) {
        releaseController(nextController, nextUnsubscribe);
        throw error;
      }

      const previousController = controller;
      const previousUnsubscribe = unsubscribe;

      controller = nextController;
      state = nextState;
      unsubscribe = nextUnsubscribe;
      connectionKey = nextConnectionKey;
      releaseController(previousController, previousUnsubscribe);
    },
    start() {
      if (disposed || started) return;
      started = true;
      controller?.start();
    },
    async synchronizeReady() {
      if (state?.status === "ready") {
        await requireController().synchronizePendingChanges();
      }
    },
  };
}
