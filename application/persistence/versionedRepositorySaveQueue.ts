// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedContentChange,
  VersionedRepository,
  VersionedRepositorySnapshot,
  VersionedRepositorySnapshotTransition,
} from "./versionedRepository";
import { finalVersionedRepositoryTransition } from "./versionedRepository";
import {
  createVersionedRepositoryTransitionAuthority,
} from "./versionedRepositoryTransitionAuthority";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import { areMergeValuesEqual } from "./threeWayMerge";

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

type DesiredContentChange<
  Content,
  Projection,
  LocalRevision extends string,
> = {
  change: PreparedVersionedContentChange<
    Content,
    Projection,
    LocalRevision
  >;
  version: number;
};

type LocalWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
  version: number;
};

export type VersionedRepositorySaveQueueOptions<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
> = {
  initialPersistenceState?: VersionedRepositoryPersistenceState<Revision>;
  initialSnapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  onPersistenceChange: (
    state: VersionedRepositoryPersistenceState<Revision>,
  ) => void;
  onSnapshotChanged: (
    snapshot: VersionedRepositorySnapshot<
      Content,
      Revision,
      LocalRevision,
      Projection
    >,
  ) => void;
  repository: VersionedRepository<
    Content,
    Revision,
    LocalRevision,
    Location,
    Projection
  >;
  scheduler: Pick<ApplicationScheduler, "schedule">;
};

export type VersionedRepositorySaveQueue<
  Content,
  Projection,
  LocalRevision extends string,
> = {
  dispose: () => void;
  enqueue: (
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
  ) => void;
  flushLocal: () => Promise<void>;
  hasActiveSync: () => boolean;
  getLocalRevision: () => LocalRevision;
  prepareForDiscard: () => Promise<void>;
  prepareForReload: () => Promise<void>;
  requestSync: () => void;
  synchronizePendingChanges: () => Promise<void>;
};

export class VersionedRepositorySynchronizationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionedRepositorySynchronizationBlockedError";
  }
}

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
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
>({
  initialSnapshot,
  initialPersistenceState,
  onPersistenceChange,
  onSnapshotChanged,
  repository,
  scheduler,
}: VersionedRepositorySaveQueueOptions<
  Content,
  Projection,
  Revision,
  LocalRevision,
  Location
>): VersionedRepositorySaveQueue<Content, Projection, LocalRevision> {
  let activeStage: Promise<void> | null = null;
  let activeSync: Promise<void> | null = null;
  let conflictRevision: Revision | null =
    initialPersistenceState?.status === "conflict"
      ? initialPersistenceState.remoteRevision
      : initialSnapshot.conflictRevision;
  const transitionAuthority = createVersionedRepositoryTransitionAuthority(
    initialSnapshot,
  );
  let desired: DesiredContentChange<
    Content,
    Projection,
    LocalRevision
  > | null = null;
  let disposed = false;
  let localStageBlocked = false;
  let localStageMessage: string | null = null;
  let localWaiters: LocalWaiter[] = [];
  let offline = initialPersistenceState?.status === "offline";
  let remoteRetryIndex = 0;
  let cancelRemoteRetry: (() => void) | null = null;
  let syncDue = initialSnapshot.pendingChanges;
  let syncTerminalBlocked = initialPersistenceState?.status === "error";
  let syncTerminalMessage: string | null = null;
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
  const acceptAuthorityTransitions = (
    transitions: readonly VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >[],
  ) => {
    if (
      transitionAuthority.accept(transitions) &&
      !desired &&
      stagedVersion === version
    ) {
      onSnapshotChanged(transitionAuthority.getSnapshot());
    }
  };
  const compactAuthorityTransitionHistory = () => {
    if (activeStage || activeSync) return;
    transitionAuthority.compact();
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
        const transition = await repository.stageSnapshot(target.change);

        localStageBlocked = false;
        localStageMessage = null;
        stagedVersion = Math.max(stagedVersion, target.version);
        settleLocalWaiters(target.version, (waiter) => waiter.resolve());

        if (
          desired &&
          desired.version !== target.version &&
          areMergeValuesEqual(
            transition.snapshot.content,
            target.change.after.content,
          )
        ) {
          desired = {
            ...desired,
            change: {
              ...desired.change,
              baseLocalRevision: transition.snapshot.localRevision,
              before: {
                content: transition.snapshot.content,
                projection: transition.snapshot.projection,
              },
            },
          };
        }
        if (desired?.version === target.version) {
          desired = null;
        }
        acceptAuthorityTransitions([transition]);

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
        localStageMessage = error instanceof Error
          ? error.message
          : "Local repository stage failed.";
        settleLocalWaiters(target.version, (waiter) => waiter.reject(error));
        onPersistenceChange({
          localCopySafe: false,
          message: localStageMessage,
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
      compactAuthorityTransitionHistory();
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
      syncTerminalMessage = error instanceof Error
        ? error.message
        : "Local repository synchronization state failed.";
      onPersistenceChange({
        localCopySafe: false,
        message: syncTerminalMessage,
        phase: "local",
        status: "error",
      });
      return;
    }

    acceptAuthorityTransitions(result.transitions);
    const reportedSnapshot = finalVersionedRepositoryTransition(result).snapshot;

    switch (result.status) {
      case "synced":
        offline = false;
        remoteRetryIndex = 0;
        syncTerminalBlocked = false;
        syncTerminalMessage = null;
        clearRetryTimer();
        if (desired || transitionAuthority.getSnapshot().pendingChanges) {
          syncDue = true;
          onPersistenceChange({ status: "pending-sync" });
        } else {
          onPersistenceChange({ status: "saved" });
        }
        break;
      case "offline": {
        offline = true;
        const hasOfflinePendingChanges = desired !== null ||
          transitionAuthority.getSnapshot().pendingChanges ||
          reportedSnapshot.pendingChanges;
        onPersistenceChange({
          pendingChanges: hasOfflinePendingChanges,
          status: "offline",
        });
        if (hasOfflinePendingChanges) {
          scheduleRetry();
        }
        break;
      }
      case "conflict": {
        const reportedConflictRevision =
          transitionAuthority.getSnapshot().conflictRevision ??
          reportedSnapshot.conflictRevision;

        if (!reportedConflictRevision) {
          syncTerminalBlocked = true;
          syncTerminalMessage =
            "Repository reported a conflict without a conflict snapshot.";
          onPersistenceChange({
            localCopySafe: false,
            message: syncTerminalMessage,
            phase: "local",
            status: "error",
          });
          break;
        }
        conflictRevision = reportedConflictRevision;
        clearRetryTimer();
        onPersistenceChange({
          remoteRevision: reportedConflictRevision,
          status: "conflict",
        });
        break;
      }
      case "sync-error":
        clearRetryTimer();
        syncTerminalBlocked = true;
        syncTerminalMessage = result.message;
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
      compactAuthorityTransitionHistory();
    });

    return activeSync;
  }

  if (initialPersistenceState) {
    onPersistenceChange(initialPersistenceState);
    if (
      initialPersistenceState.status === "pending-sync" ||
      (initialPersistenceState.status === "offline" &&
        initialPersistenceState.pendingChanges)
    ) {
      scheduleDebouncedSync();
    }
  } else if (initialSnapshot.conflictRevision) {
    onPersistenceChange({
      remoteRevision: initialSnapshot.conflictRevision,
      status: "conflict",
    });
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
    enqueue(change) {
      if (disposed) {
        throw new VersionedRepositorySynchronizationBlockedError(
          "Repository session is unavailable.",
        );
      }
      if (conflictRevision) {
        throw new VersionedRepositorySynchronizationBlockedError(
          "Repository conflict must be resolved before editing.",
        );
      }
      version += 1;
      desired = {
        change: {
          after: change.after,
          baseLocalRevision:
            desired?.change.baseLocalRevision ?? change.baseLocalRevision,
          before: desired?.change.before ?? change.before,
        },
        version,
      };
      localStageBlocked = false;
      syncTerminalBlocked = false;
      scheduleDebouncedSync();
      void startStage();
    },
    flushLocal,
    hasActiveSync() {
      return activeSync !== null;
    },
    getLocalRevision() {
      return transitionAuthority.getSnapshot().localRevision;
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
        syncTerminalMessage = null;
        syncDue = true;
        void startSync();
      }
    },
    async synchronizePendingChanges() {
      if (disposed) {
        throw new VersionedRepositorySynchronizationBlockedError(
          "Repository session is unavailable.",
        );
      }
      clearSyncTimer();
      clearRetryTimer();
      await flushLocal();
      if (localStageBlocked) {
        throw new VersionedRepositorySynchronizationBlockedError(
          localStageMessage ?? "Local changes could not be staged.",
        );
      }
      if (conflictRevision) {
        throw new VersionedRepositorySynchronizationBlockedError(
          "Repository conflict must be resolved before using Agent.",
        );
      }

      syncTerminalBlocked = false;
      syncTerminalMessage = null;
      syncDue = true;
      while (true) {
        await startSync();
        if (conflictRevision) {
          throw new VersionedRepositorySynchronizationBlockedError(
            "Repository conflict must be resolved before using Agent.",
          );
        }
        if (offline) {
          throw new VersionedRepositorySynchronizationBlockedError(
            "Repository is offline; Agent operation was blocked.",
          );
        }
        if (syncTerminalBlocked) {
          throw new VersionedRepositorySynchronizationBlockedError(
            syncTerminalMessage ?? "Repository synchronization failed.",
          );
        }
        if (!desired && !activeStage && !activeSync && !syncDue) return;
      }
    },
  };
}
