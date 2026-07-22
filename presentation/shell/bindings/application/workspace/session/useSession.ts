import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { WorkspaceRepository } from "../../../../../../application/repository/workspaceRepository";
import type { SessionCommands } from "../../../../../../application/workspace/session/sessionCommands";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionControllerState,
  type WorkspaceSessionReadyState,
} from "../../../../../../application/workspace/session/workspaceSessionController";

const browserSessionCommandDependencies = {
  createBlockId: () => globalThis.crypto.randomUUID(),
  createFolderId: () => `folder-${globalThis.crypto.randomUUID()}`,
  createNoteId: () => `note-${globalThis.crypto.randomUUID()}`,
  createSyntaxFileId: () => `syntax-${globalThis.crypto.randomUUID()}`,
  now: () => new Date().toISOString(),
};
type ActiveSessionState = WorkspaceSessionReadyState;

export type ActiveSession = ActiveSessionState & {
  activateSyntaxFile: (fileId: string) => Promise<void>;
  commands: SessionCommands;
  createSyntaxFile: (templateFileId: string | null) => Promise<string>;
  deleteSyntaxFile: (fileId: string) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  flushPendingChanges: () => Promise<void>;
  prepareForRepositoryRemoval: () => Promise<{ resume: () => void }>;
  reload: () => Promise<void>;
  updateSyntaxFileSource: (fileId: string, source: string) => Promise<void>;
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

export function useSession({
  repository,
}: {
  repository: WorkspaceRepository;
}): Session {
  const lifecycleEpochs = useRef(
    new WeakMap<ReturnType<typeof createWorkspaceSessionController>, number>(),
  );
  const controller = useMemo(
    () =>
      createWorkspaceSessionController({
        commandDependencies: browserSessionCommandDependencies,
        repository,
      }),
    [repository],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    const epoch = (lifecycleEpochs.current.get(controller) ?? 0) + 1;

    lifecycleEpochs.current.set(controller, epoch);
    controller.start();
    return () => {
      // React StrictMode immediately replays passive effects in development.
      // Defer terminal disposal by one microtask so the replay can acquire a
      // newer lifecycle epoch. A real unmount or controller replacement has no
      // matching epoch and therefore still disposes deterministically.
      queueMicrotask(() => {
        if (lifecycleEpochs.current.get(controller) === epoch) {
          lifecycleEpochs.current.delete(controller);
          controller.dispose();
        }
      });
    };
  }, [controller]);

  useEffect(() => {
    const flushLocal = () => {
      void controller.flushPendingChanges().catch(() => undefined);
    };
    const flushWhenHidden = () => {
      if (globalThis.document?.visibilityState === "hidden") {
        flushLocal();
      }
    };

    globalThis.addEventListener("pagehide", flushLocal);
    globalThis.document?.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      globalThis.removeEventListener("pagehide", flushLocal);
      globalThis.document?.removeEventListener(
        "visibilitychange",
        flushWhenHidden,
      );
    };
  }, [controller]);

  return useMemo(
    () => createSession(state, controller),
    [controller, state],
  );
}
