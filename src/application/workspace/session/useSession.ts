import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import type { SessionCommands } from "./sessionCommands";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionConflictState,
  type WorkspaceSessionControllerState,
  type WorkspaceSessionReadyState,
} from "./workspaceSessionController";
export type { SessionCommands } from "./sessionCommands";
export type { WorkspaceSessionSaveStatus } from "./workspaceSessionSaveQueue";

type ActiveSessionState =
  | WorkspaceSessionConflictState
  | WorkspaceSessionReadyState;

export type ActiveSession = ActiveSessionState & {
  commands: SessionCommands;
  discardPendingChangesAndReload: () => Promise<void>;
  reload: () => Promise<void>;
  updateWorkspaceSyntaxSource: (source: string) => Promise<void>;
  useDefaultWorkspaceSyntax: () => Promise<void>;
};

export type Session =
  | ActiveSession
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

function createSession(
  state: WorkspaceSessionControllerState,
  controller: ReturnType<typeof createWorkspaceSessionController>,
): Session {
  if (state.status === "loading") {
    return state;
  }

  if (state.status === "failed") {
    return { ...state, retry: controller.reload };
  }

  return {
    ...state,
    commands: controller.commands,
    discardPendingChangesAndReload:
      controller.discardPendingChangesAndReload,
    reload: controller.reload,
    updateWorkspaceSyntaxSource: controller.updateWorkspaceSyntaxSource,
    useDefaultWorkspaceSyntax: controller.useDefaultWorkspaceSyntax,
  };
}

export function useSession({
  repository,
}: {
  repository: WorkspaceRepository;
}): Session {
  const controller = useMemo(
    () => createWorkspaceSessionController({ repository }),
    [repository],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    controller.start();
    return controller.dispose;
  }, [controller]);

  return useMemo(
    () => createSession(state, controller),
    [controller, state],
  );
}
