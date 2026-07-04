import type { WorkspaceData } from "../../workspace/model/workspaceData";

export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "error";

type WorkspaceDataSaveQueueOptions = {
  onError: (error: unknown) => void;
  onStatusChange: (status: WorkspaceSaveStatus) => void;
  save: (workspaceData: WorkspaceData) => Promise<void>;
};

export type WorkspaceDataSaveQueue = {
  enqueue: (workspaceData: WorkspaceData) => void;
  waitForIdle: () => Promise<void>;
};

export function createWorkspaceDataSaveQueue({
  onError,
  onStatusChange,
  save,
}: WorkspaceDataSaveQueueOptions): WorkspaceDataSaveQueue {
  let pendingWorkspaceData: WorkspaceData | null = null;
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
      while (pendingWorkspaceData) {
        const nextWorkspaceData = pendingWorkspaceData;
        pendingWorkspaceData = null;
        onStatusChange("saving");
        await save(nextWorkspaceData);
      }

      onStatusChange("saved");
    } catch (error) {
      pendingWorkspaceData = null;
      onError(error);
      onStatusChange("error");
    } finally {
      activePromise = null;

      if (pendingWorkspaceData) {
        start();
      }
    }
  };

  return {
    enqueue(workspaceData) {
      pendingWorkspaceData = workspaceData;
      start();
    },
    async waitForIdle() {
      while (activePromise) {
        await activePromise;
      }
    },
  };
}
