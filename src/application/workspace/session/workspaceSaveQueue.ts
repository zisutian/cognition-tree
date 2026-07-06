import type { WorkspaceData } from "../../../workspace/model/workspaceData";

export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "error";

type WorkspaceSaveQueueOptions = {
  onError: (error: unknown) => void;
  onStatusChange: (status: WorkspaceSaveStatus) => void;
  save: (data: WorkspaceData) => Promise<void>;
};

export type WorkspaceSaveQueue = {
  enqueue: (data: WorkspaceData) => void;
  waitForIdle: () => Promise<void>;
};

export function createWorkspaceSaveQueue({
  onError,
  onStatusChange,
  save,
}: WorkspaceSaveQueueOptions): WorkspaceSaveQueue {
  let pendingData: WorkspaceData | null = null;
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
      while (pendingData) {
        const nextData = pendingData;
        pendingData = null;
        onStatusChange("saving");
        await save(nextData);
      }

      onStatusChange("saved");
    } catch (error) {
      pendingData = null;
      onError(error);
      onStatusChange("error");
    } finally {
      activePromise = null;

      if (pendingData) {
        start();
      }
    }
  };

  return {
    enqueue(data) {
      pendingData = data;
      start();
    },
    async waitForIdle() {
      while (activePromise) {
        await activePromise;
      }
    },
  };
}
