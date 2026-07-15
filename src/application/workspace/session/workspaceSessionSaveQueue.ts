import type { WorkspaceRepositoryContent } from "../../../storage/repository/workspaceRepository";

export type WorkspaceSessionSaveStatus =
  | "error"
  | "idle"
  | "pending"
  | "saved"
  | "saving";

type PendingContent = {
  content: WorkspaceRepositoryContent;
  version: number;
};

type SaveWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
  version: number;
};

type WorkspaceSessionSaveQueueOptions = {
  onContentSaved: (content: WorkspaceRepositoryContent) => void;
  onError: (error: unknown) => void;
  onStatusChange: (status: WorkspaceSessionSaveStatus) => void;
  save: (content: WorkspaceRepositoryContent) => Promise<void>;
};

export type WorkspaceSessionSaveQueue = {
  discardPendingChanges: () => Promise<void>;
  dispose: () => void;
  enqueue: (content: WorkspaceRepositoryContent) => void;
  enqueueAndWait: (content: WorkspaceRepositoryContent) => Promise<void>;
  flush: () => Promise<void>;
};

export const workspaceSessionSaveDelayMs = 500;

export function createWorkspaceSessionSaveQueue({
  onContentSaved,
  onError,
  onStatusChange,
  save,
}: WorkspaceSessionSaveQueueOptions): WorkspaceSessionSaveQueue {
  let activePromise: Promise<void> | null = null;
  let discardedThroughVersion = 0;
  let isDiscarding = false;
  let pendingContent: PendingContent | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveVersion = 0;
  let waiters: SaveWaiter[] = [];

  const clearSaveTimer = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const settleWaiters = (
    version: number,
    settle: (waiter: SaveWaiter) => void,
  ) => {
    const settledWaiters = waiters.filter(
      (waiter) => waiter.version <= version,
    );

    waiters = waiters.filter((waiter) => waiter.version > version);
    settledWaiters.forEach(settle);
  };

  const savePendingContent = async () => {
    while (pendingContent && !isDiscarding) {
      clearSaveTimer();

      const pending = pendingContent;

      pendingContent = null;
      onStatusChange("saving");

      try {
        await save(pending.content);
        onContentSaved(pending.content);
        settleWaiters(pending.version, (waiter) => waiter.resolve());
      } catch (error) {
        if (
          !pendingContent &&
          pending.version > discardedThroughVersion
        ) {
          pendingContent = pending;
        }

        settleWaiters(pending.version, (waiter) => waiter.reject(error));
        onError(error);
        onStatusChange("error");
        throw error;
      }
    }

    if (!isDiscarding) {
      onStatusChange("saved");
    }
  };

  const startSaving = () => {
    clearSaveTimer();

    if (!activePromise) {
      activePromise = savePendingContent().finally(() => {
        activePromise = null;
      });
    }

    return activePromise;
  };

  const scheduleSave = () => {
    clearSaveTimer();
    onStatusChange("pending");
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void startSaving().catch(() => undefined);
    }, workspaceSessionSaveDelayMs);
  };

  const queueContent = (content: WorkspaceRepositoryContent) => {
    saveVersion += 1;
    pendingContent = { content, version: saveVersion };
    scheduleSave();

    return saveVersion;
  };

  return {
    async discardPendingChanges() {
      const discardVersion = saveVersion;

      discardedThroughVersion = Math.max(
        discardedThroughVersion,
        discardVersion,
      );
      isDiscarding = true;
      clearSaveTimer();

      const discardError = new Error("Pending repository changes were discarded");

      if (pendingContent && pendingContent.version <= discardVersion) {
        pendingContent = null;
      }

      settleWaiters(discardVersion, (waiter) => waiter.reject(discardError));

      try {
        if (activePromise) {
          await activePromise;
        }
      } catch {
        // Failed content at or before discardVersion must not be requeued.
      } finally {
        isDiscarding = false;

        if (pendingContent) {
          scheduleSave();
        } else {
          onStatusChange("idle");
        }
      }
    },
    dispose() {
      clearSaveTimer();
      pendingContent = null;

      const disposeError = new Error("Workspace session save queue was disposed");

      waiters.forEach((waiter) => waiter.reject(disposeError));
      waiters = [];
    },
    enqueue(content) {
      queueContent(content);
    },
    enqueueAndWait(content) {
      const version = queueContent(content);

      return new Promise<void>((resolve, reject) => {
        waiters.push({ reject, resolve, version });
      });
    },
    async flush() {
      clearSaveTimer();

      if (activePromise) {
        await activePromise;
        return;
      }

      if (pendingContent) {
        await startSaving();
      }
    },
  };
}
