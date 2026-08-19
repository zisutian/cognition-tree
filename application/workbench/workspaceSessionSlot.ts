// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepository } from "../workspace/persistence/workspaceRepository";
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
  let repository: WorkspaceRepository | null = null;
  let started = false;
  let state: WorkspaceSessionControllerState | null = null;
  let unsubscribe: (() => void) | null = null;

  const disposeController = () => {
    unsubscribe?.();
    unsubscribe = null;
    controller?.dispose();
    controller = null;
    state = null;
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeController();
      connectionKey = "";
      repository = null;
    },
    async flushReady() {
      if (state?.status === "ready") {
        await controller!.flushPendingChanges();
      }
    },
    getController: () => controller,
    getSnapshot: () =>
      controller && state ? state : { status: "absent" },
    reconcile(descriptor) {
      const nextConnectionKey = descriptor
        ? JSON.stringify({
            adapter: descriptor.adapter,
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
      disposeController();
      connectionKey = nextConnectionKey;
      repository = descriptor ? repositories.openRepository(descriptor) : null;
      if (!repository) return;

      const nextController = createWorkspaceSessionController({
        commandDependencies,
        repository,
        scheduler,
      });

      controller = nextController;
      state = nextController.getState();
      unsubscribe = nextController.subscribe(() => {
        if (controller !== nextController) return;
        state = nextController.getState();
        onChange();
      });
      if (started) nextController.start();
    },
    start() {
      if (disposed || started) return;
      started = true;
      controller?.start();
    },
  };
}
