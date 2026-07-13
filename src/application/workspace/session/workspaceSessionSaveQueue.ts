import type { WorkspaceData } from "../../../workspace/model/workspaceData";

export type WorkspaceSessionSaveStatus =
  | "error"
  | "idle"
  | "pending"
  | "saved"
  | "saving";

type PendingSyntaxSource = {
  source: string;
  version: number;
};

type SyntaxSaveWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
  version: number;
};

type WorkspaceSessionSaveQueueOptions = {
  onError: (error: unknown) => void;
  onStatusChange: (status: WorkspaceSessionSaveStatus) => void;
  onSyntaxSourceSaved: (source: string) => void;
  saveSyntaxSource: (source: string) => Promise<void>;
  saveWorkspace: (data: WorkspaceData) => Promise<void>;
};

export type WorkspaceSessionSaveQueue = {
  enqueueSyntaxSource: (source: string) => Promise<void>;
  enqueueWorkspace: (data: WorkspaceData) => void;
  flush: () => Promise<void>;
};

export const workspaceSessionSaveDelayMs = 500;

export function createWorkspaceSessionSaveQueue({
  onError,
  onStatusChange,
  onSyntaxSourceSaved,
  saveSyntaxSource,
  saveWorkspace,
}: WorkspaceSessionSaveQueueOptions): WorkspaceSessionSaveQueue {
  let activePromise: Promise<void> | null = null;
  let pendingSyntaxSource: PendingSyntaxSource | null = null;
  let pendingWorkspace: WorkspaceData | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let syntaxVersion = 0;
  let syntaxWaiters: SyntaxSaveWaiter[] = [];

  const hasPendingChanges = () =>
    pendingWorkspace !== null || pendingSyntaxSource !== null;

  const clearSaveTimer = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const settleSyntaxWaiters = (
    version: number,
    settle: (waiter: SyntaxSaveWaiter) => void,
  ) => {
    const settledWaiters = syntaxWaiters.filter(
      (waiter) => waiter.version <= version,
    );

    syntaxWaiters = syntaxWaiters.filter(
      (waiter) => waiter.version > version,
    );
    settledWaiters.forEach(settle);
  };

  const restoreWorkspace = (workspace: WorkspaceData | null) => {
    if (!pendingWorkspace && workspace) {
      pendingWorkspace = workspace;
    }
  };

  const restoreSyntaxSource = (
    syntaxSource: PendingSyntaxSource | null,
  ) => {
    if (!pendingSyntaxSource && syntaxSource) {
      pendingSyntaxSource = syntaxSource;
    }
  };

  const savePendingChanges = async () => {
    while (hasPendingChanges()) {
      clearSaveTimer();

      const workspace = pendingWorkspace;
      const syntaxSource = pendingSyntaxSource;
      let workspaceSaved = false;
      let syntaxSaved = false;

      pendingWorkspace = null;
      pendingSyntaxSource = null;
      onStatusChange("saving");

      try {
        if (workspace) {
          await saveWorkspace(workspace);
          workspaceSaved = true;
        }

        if (syntaxSource) {
          await saveSyntaxSource(syntaxSource.source);
          syntaxSaved = true;
          onSyntaxSourceSaved(syntaxSource.source);
          settleSyntaxWaiters(syntaxSource.version, (waiter) => {
            waiter.resolve();
          });
        }
      } catch (error) {
        if (!workspaceSaved) {
          restoreWorkspace(workspace);
        }

        if (!syntaxSaved) {
          restoreSyntaxSource(syntaxSource);

          if (syntaxSource) {
            settleSyntaxWaiters(syntaxSource.version, (waiter) => {
              waiter.reject(error);
            });
          }
        }

        onError(error);
        onStatusChange("error");
        throw error;
      }
    }

    onStatusChange("saved");
  };

  const startSaving = () => {
    clearSaveTimer();

    if (!activePromise) {
      activePromise = savePendingChanges().finally(() => {
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

  return {
    enqueueSyntaxSource(source) {
      syntaxVersion += 1;
      pendingSyntaxSource = { source, version: syntaxVersion };
      scheduleSave();

      return new Promise<void>((resolve, reject) => {
        syntaxWaiters.push({ reject, resolve, version: syntaxVersion });
      });
    },
    enqueueWorkspace(data) {
      pendingWorkspace = data;
      scheduleSave();
    },
    async flush() {
      clearSaveTimer();

      if (activePromise) {
        await activePromise;
        return;
      }

      if (hasPendingChanges()) {
        await startSaving();
      }
    },
  };
}
