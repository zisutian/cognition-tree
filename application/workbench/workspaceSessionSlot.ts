// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepository } from "../repository/workspaceRepository";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type { SessionCommandDependencies } from "../workspace/session/sessionCommands";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../workspace/session/workspaceSessionController";

export type WorkbenchWorkspaceSession =
  | { status: "absent" }
  | ({ controller: WorkspaceSessionController } &
      WorkspaceSessionControllerState);

export type WorkspaceSessionSlot = {
  dispose(): void;
  flushReady(): Promise<void>;
  getController(): WorkspaceSessionController | null;
  getSnapshot(): WorkbenchWorkspaceSession;
  reconcile(repository: WorkspaceRepository | null): void;
  start(): void;
};

export function createWorkspaceSessionSlot({
  commandDependencies,
  onChange,
  scheduler,
}: {
  commandDependencies: SessionCommandDependencies;
  onChange(): void;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): WorkspaceSessionSlot {
  let controller: WorkspaceSessionController | null = null;
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
      repository = null;
    },
    async flushReady() {
      if (state?.status === "ready") {
        await controller!.flushPendingChanges();
      }
    },
    getController: () => controller,
    getSnapshot: () =>
      controller && state
        ? { controller, ...state }
        : { status: "absent" },
    reconcile(nextRepository) {
      if (
        disposed ||
        (nextRepository === repository &&
          (controller !== null || nextRepository === null))
      ) {
        return;
      }
      disposeController();
      repository = nextRepository;
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
