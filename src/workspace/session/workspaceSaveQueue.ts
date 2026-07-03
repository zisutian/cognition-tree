import type { WorkspaceData } from "../model/workspaceData";

export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "error";

type WorkspaceSaveQueueOptions = {
  onError: (error: unknown) => void;
  onStatusChange: (status: WorkspaceSaveStatus) => void;
  save: (workspace: WorkspaceData) => Promise<void>;
};

export type WorkspaceSaveQueue = {
  enqueue: (workspace: WorkspaceData) => void;
  waitForIdle: () => Promise<void>;
};

export function createWorkspaceSaveQueue({
  onError,
  onStatusChange,
  save,
}: WorkspaceSaveQueueOptions): WorkspaceSaveQueue {
  let pendingWorkspace: WorkspaceData | null = null;
  let activePromise: Promise<void> | null = null;

  const start = () => {
    if (activePromise) {
      return activePromise;
    }

    activePromise = flush();
    return activePromise;
  };

  const flush = async () => {
    try {
      while (pendingWorkspace) {
        const nextWorkspace = pendingWorkspace;
        pendingWorkspace = null;
        onStatusChange("saving");
        await save(nextWorkspace);
      }

      onStatusChange("saved");
    } catch (error) {
      pendingWorkspace = null;
      onError(error);
      onStatusChange("error");
    } finally {
      activePromise = null;

      if (pendingWorkspace) {
        start();
      }
    }
  };

  return {
    enqueue(workspace) {
      pendingWorkspace = workspace;
      start();
    },
    async waitForIdle() {
      while (activePromise) {
        await activePromise;
      }
    },
  };
}
