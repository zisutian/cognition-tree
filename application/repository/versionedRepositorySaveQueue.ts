// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepository,
  VersionedRepositorySnapshot,
} from "./versionedRepository";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";

export type VersionedRepositoryPersistenceState<Revision extends string> =
  | { status: "saved" }
  | { status: "saving-local" }
  | { status: "pending-sync" }
  | { status: "syncing" }
  | { pendingChanges: boolean; status: "offline" }
  | { remoteRevision: Revision; status: "conflict" }
  | {
      localCopySafe: boolean;
      message: string;
      phase: "local" | "sync";
      status: "error";
    };

type DesiredContent<Content> = {
  content: Content;
  version: number;
};

type LocalWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
  version: number;
};

export type VersionedRepositorySaveQueueOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
> = {
  initialPersistenceState?: VersionedRepositoryPersistenceState<Revision>;
  initialSnapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision
  >;
  onLocalStaged: (content: Content, localRevision: LocalRevision) => void;
  onPersistenceChange: (
    state: VersionedRepositoryPersistenceState<Revision>,
  ) => void;
  onRemoteRevision: (revision: Revision | null) => void;
  repository: VersionedRepository<Content, Revision, LocalRevision, Location>;
  scheduler: Pick<ApplicationScheduler, "schedule">;
};

export type VersionedRepositorySaveQueue<Content, LocalRevision extends string> = {
  dispose: () => void;
  enqueue: (content: Content) => void;
  flushLocal: () => Promise<void>;
  getLocalRevision: () => LocalRevision;
  prepareForDiscard: () => Promise<void>;
  prepareForReload: () => Promise<void>;
  requestSync: () => void;
};

export const versionedRepositorySaveDelayMs = 500;
export const versionedRepositoryRetryDelaysMs = [
  1_000,
  2_000,
  5_000,
  10_000,
  30_000,
] as const;

export function createVersionedRepositorySaveQueue<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
>({
  initialSnapshot,
  initialPersistenceState,
  onLocalStaged,
  onPersistenceChange,
  onRemoteRevision,
  repository,
  scheduler,
}: VersionedRepositorySaveQueueOptions<
  Content,
  Revision,
  LocalRevision,
  Location
>): VersionedRepositorySaveQueue<Content, LocalRevision> {
  let activeStage: Promise<void> | null = null;
  let activeSync: Promise<void> | null = null;
  let conflictRevision: Revision | null =
    initialPersistenceState?.status === "conflict"
      ? initialPersistenceState.remoteRevision
      : null;
  let desired: DesiredContent<Content> | null = null;
  let disposed = false;
  let localRevision = initialSnapshot.localRevision;
  let localStageBlocked = false;
  let localWaiters: LocalWaiter[] = [];
  let offline = initialPersistenceState?.status === "offline";
  let remoteRetryIndex = 0;
  let cancelRemoteRetry: (() => void) | null = null;
  let syncDue = initialSnapshot.pendingChanges;
  let syncTerminalBlocked = initialPersistenceState?.status === "error";
  let cancelSync: (() => void) | null = null;
  let stagedVersion = 0;
  let version = 0;

  const unsubscribeReconnect = repository.subscribeReconnect(() => {
    if (disposed || conflictRevision || syncTerminalBlocked) {
      return;
    }

    offline = false;
    remoteRetryIndex = 0;
    syncDue = true;
    void startSync();
  });

  const clearSyncTimer = () => {
    if (cancelSync) {
      cancelSync();
      cancelSync = null;
    }
  };
  const clearRetryTimer = () => {
    if (cancelRemoteRetry) {
      cancelRemoteRetry();
      cancelRemoteRetry = null;
    }
  };
  const settleLocalWaiters = (
    throughVersion: number,
    settle: (waiter: LocalWaiter) => void,
  ) => {
    const ready = localWaiters.filter(
      (waiter) => waiter.version <= throughVersion,
    );

    localWaiters = localWaiters.filter(
      (waiter) => waiter.version > throughVersion,
    );
    ready.forEach(settle);
  };
  const scheduleRetry = () => {
    if (disposed || conflictRevision || cancelRemoteRetry) {
      return;
    }

    const delay = versionedRepositoryRetryDelaysMs[
      Math.min(remoteRetryIndex, versionedRepositoryRetryDelaysMs.length - 1)
    ];

    remoteRetryIndex += 1;
    cancelRemoteRetry = scheduler.schedule(() => {
      cancelRemoteRetry = null;
      syncDue = true;
      void startSync();
    }, delay);
  };
  const scheduleDebouncedSync = () => {
    if (disposed || conflictRevision || syncTerminalBlocked) {
      return;
    }

    clearSyncTimer();
    cancelSync = scheduler.schedule(() => {
      cancelSync = null;
      syncDue = true;
      void startSync();
    }, versionedRepositorySaveDelayMs);
  };
  const runStage = async () => {
    while (desired) {
      const target = desired;

      onPersistenceChange({ status: "saving-local" });

      try {
        const result = await repository.stageSnapshot({
          content: target.content,
          expectedLocalRevision: localRevision,
        });

        localRevision = result.localRevision;
        localStageBlocked = false;
        stagedVersion = Math.max(stagedVersion, target.version);
        onLocalStaged(target.content, result.localRevision);
        settleLocalWaiters(target.version, (waiter) => waiter.resolve());

        if (desired?.version === target.version) {
          desired = null;
        }

        if (conflictRevision) {
          onPersistenceChange({
            remoteRevision: conflictRevision,
            status: "conflict",
          });
        } else if (offline) {
          onPersistenceChange({ pendingChanges: true, status: "offline" });
        } else {
          onPersistenceChange({ status: "pending-sync" });
        }
      } catch (error) {
        localStageBlocked = true;
        settleLocalWaiters(target.version, (waiter) => waiter.reject(error));
        onPersistenceChange({
          localCopySafe: false,
          message: error instanceof Error
            ? error.message
            : "Local repository stage failed.",
          phase: "local",
          status: "error",
        });
        return;
      }
    }

    if (syncDue && !disposed && !conflictRevision) {
      void startSync();
    }
  };
  const startStage = () => {
    activeStage ??= runStage().finally(() => {
      activeStage = null;

      if (desired && !localStageBlocked) {
        void startStage();
      }
    });

    return activeStage;
  };
  const runSync = async () => {
    if (disposed || conflictRevision || syncTerminalBlocked || !syncDue) {
      return;
    }

    if (activeStage) {
      await activeStage;
    }
    if (
      desired ||
      disposed ||
      conflictRevision ||
      syncTerminalBlocked ||
      !syncDue
    ) {
      return;
    }

    syncDue = false;
    onPersistenceChange({ status: "syncing" });
    let result: Awaited<
      ReturnType<typeof repository.synchronizePendingSnapshot>
    >;

    try {
      result = await repository.synchronizePendingSnapshot();
    } catch (error) {
      syncTerminalBlocked = true;
      onPersistenceChange({
        localCopySafe: false,
        message: error instanceof Error
          ? error.message
          : "Local repository synchronization state failed.",
        phase: "local",
        status: "error",
      });
      return;
    }

    localRevision = result.localRevision;
    onRemoteRevision(result.remoteRevision);

    switch (result.status) {
      case "synced":
        offline = false;
        remoteRetryIndex = 0;
        syncTerminalBlocked = false;
        clearRetryTimer();
        if (desired || result.pendingChanges) {
          syncDue = true;
          onPersistenceChange({ status: "pending-sync" });
        } else {
          onPersistenceChange({ status: "saved" });
        }
        break;
      case "offline":
        offline = true;
        onPersistenceChange({
          pendingChanges: result.pendingChanges,
          status: "offline",
        });
        if (result.pendingChanges) {
          scheduleRetry();
        }
        break;
      case "conflict":
        conflictRevision = result.remoteRevision;
        clearRetryTimer();
        onPersistenceChange({
          remoteRevision: result.remoteRevision,
          status: "conflict",
        });
        break;
      case "sync-error":
        clearRetryTimer();
        syncTerminalBlocked = true;
        onPersistenceChange({
          localCopySafe: true,
          message: result.message,
          phase: "sync",
          status: "error",
        });
        break;
    }
  };
  async function startSync() {
    activeSync ??= runSync().finally(() => {
      activeSync = null;

      if (
        syncDue &&
        !disposed &&
        !conflictRevision &&
        !syncTerminalBlocked &&
        !desired &&
        !activeStage
      ) {
        void startSync();
      }
    });

    return activeSync;
  }

  if (initialPersistenceState) {
    onPersistenceChange(initialPersistenceState);
    if (
      initialPersistenceState.status === "offline" &&
      initialPersistenceState.pendingChanges
    ) {
      scheduleDebouncedSync();
    }
  } else if (initialSnapshot.pendingChanges) {
    onPersistenceChange({ status: "pending-sync" });
    if (!conflictRevision) {
      scheduleDebouncedSync();
    }
  } else {
    onPersistenceChange({ status: "saved" });
  }

  const flushLocal = async () => {
    const targetVersion = version;

    if (targetVersion <= stagedVersion) {
      return;
    }

    const completion = new Promise<void>((resolve, reject) => {
      localWaiters.push({ reject, resolve, version: targetVersion });
    });

    localStageBlocked = false;
    void startStage();
    await completion;
  };

  return {
    dispose() {
      disposed = true;
      clearSyncTimer();
      clearRetryTimer();
      unsubscribeReconnect();

      if (desired) {
        void startStage();
      }
    },
    enqueue(content) {
      version += 1;
      desired = { content, version };
      localStageBlocked = false;
      syncTerminalBlocked = false;
      scheduleDebouncedSync();
      void startStage();
    },
    flushLocal,
    getLocalRevision() {
      return localRevision;
    },
    async prepareForDiscard() {
      clearSyncTimer();
      clearRetryTimer();

      try {
        await flushLocal();
      } catch (error) {
        scheduleDebouncedSync();
        throw error;
      }

      disposed = true;
      unsubscribeReconnect();
      await activeSync;
    },
    async prepareForReload() {
      clearSyncTimer();
      clearRetryTimer();

      try {
        await flushLocal();
        await activeStage;
      } catch (error) {
        scheduleDebouncedSync();
        throw error;
      }

      disposed = true;
      clearSyncTimer();
      clearRetryTimer();
      unsubscribeReconnect();
      await activeSync;
    },
    requestSync() {
      if (!disposed && !conflictRevision) {
        syncTerminalBlocked = false;
        syncDue = true;
        void startSync();
      }
    },
  };
}
