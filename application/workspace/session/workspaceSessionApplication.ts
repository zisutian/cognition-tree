// SPDX-License-Identifier: GPL-3.0-or-later

import type { SessionCommands } from "./sessionCommands";
import type {
  WorkspaceSessionController,
  WorkspaceSessionControllerState,
  WorkspaceSessionReadyState,
} from "./workspaceSessionController";

type WorkspaceSessionOperations = Pick<
  WorkspaceSessionController,
  | "activateSyntaxFile"
  | "commands"
  | "createSyntaxFile"
  | "deleteSyntaxFile"
  | "discardPendingChangesAndReload"
  | "flushPendingChanges"
  | "prepareForRepositoryRemoval"
  | "reload"
  | "updateSyntaxFileSource"
>;

export type ActiveWorkspaceSession = WorkspaceSessionReadyState & {
  activateSyntaxFile: WorkspaceSessionOperations["activateSyntaxFile"];
  commands: SessionCommands;
  createSyntaxFile: WorkspaceSessionOperations["createSyntaxFile"];
  deleteSyntaxFile: WorkspaceSessionOperations["deleteSyntaxFile"];
  discardPendingChangesAndReload:
    WorkspaceSessionOperations["discardPendingChangesAndReload"];
  flushPendingChanges: WorkspaceSessionOperations["flushPendingChanges"];
  prepareForRepositoryRemoval:
    WorkspaceSessionOperations["prepareForRepositoryRemoval"];
  reload: WorkspaceSessionOperations["reload"];
  updateSyntaxFileSource: WorkspaceSessionOperations["updateSyntaxFileSource"];
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
  controller: WorkspaceSessionOperations,
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
