import type { WorkspaceData } from "../../workspace/model/workspaceData";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type DataSaveQueueOptions = {
  onError: (error: unknown) => void;
  onStatusChange: (status: SaveStatus) => void;
  save: (data: WorkspaceData) => Promise<void>;
};

export type DataSaveQueue = {
  enqueue: (data: WorkspaceData) => void;
  waitForIdle: () => Promise<void>;
};

export function createDataSaveQueue({
  onError,
  onStatusChange,
  save,
}: DataSaveQueueOptions): DataSaveQueue {
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
