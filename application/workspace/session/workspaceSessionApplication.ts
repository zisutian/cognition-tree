// SPDX-License-Identifier: GPL-3.0-or-later

import type { SessionCommands } from "./sessionCommands";
import type {
  WorkspaceSessionController,
  WorkspaceSessionControllerState,
  WorkspaceSessionReadyState,
} from "./workspaceSessionController";

export type ActiveWorkspaceSession = WorkspaceSessionReadyState & {
  activateSyntaxFile: WorkspaceSessionController["activateSyntaxFile"];
  commands: SessionCommands;
  createSyntaxFile: WorkspaceSessionController["createSyntaxFile"];
  deleteSyntaxFile: WorkspaceSessionController["deleteSyntaxFile"];
  discardPendingChangesAndReload:
    WorkspaceSessionController["discardPendingChangesAndReload"];
  flushPendingChanges: WorkspaceSessionController["flushPendingChanges"];
  prepareForRepositoryRemoval:
    WorkspaceSessionController["prepareForRepositoryRemoval"];
  reload: WorkspaceSessionController["reload"];
  updateSyntaxFileSource: WorkspaceSessionController["updateSyntaxFileSource"];
};

export type WorkspaceSessionApplication =
  | ActiveWorkspaceSession
  | {
      status: "loading";
      storageLabel: string;
    }
  | {
      errorMessage: string;
      retry: () => Promise<void>;
      status: "failed";
      storageLabel: string;
    };

export function projectWorkspaceSessionApplication(
  controller: WorkspaceSessionController,
  state: WorkspaceSessionControllerState,
): WorkspaceSessionApplication {
  if (state.status === "loading") return state;
  if (state.status === "failed") {
    return { ...state, retry: controller.reload };
  }
  return {
    ...state,
    activateSyntaxFile: controller.activateSyntaxFile,
    commands: controller.commands,
    createSyntaxFile: controller.createSyntaxFile,
    deleteSyntaxFile: controller.deleteSyntaxFile,
    discardPendingChangesAndReload:
      controller.discardPendingChangesAndReload,
    flushPendingChanges: controller.flushPendingChanges,
    prepareForRepositoryRemoval: controller.prepareForRepositoryRemoval,
    reload: controller.reload,
    updateSyntaxFileSource: controller.updateSyntaxFileSource,
  };
}
