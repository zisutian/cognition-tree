// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type {
  VersionedContentConflictPreference,
  PreparedVersionedConflictSources,
  PreparedVersionedContent,
  PreparedVersionedContentChange,
  VersionedRepository,
  VersionedRepositoryConflictRecord,
  VersionedRepositorySnapshot,
} from "./versionedRepository";
import {
  createVersionedRepositorySaveQueue,
  type VersionedRepositoryPersistenceState,
  type VersionedRepositorySaveQueue,
} from "./versionedRepositorySaveQueue";

export type VersionedSessionReadyState<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
> = {
  content: Content;
  location: Location;
  persistence: VersionedRepositoryPersistenceState<Revision>;
  projection: Projection;
  snapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  status: "ready";
  storageLabel: string;
};

export type VersionedSessionState<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
> =
  | { status: "unavailable" }
  | { status: "loading"; storageLabel: string }
  | { errorMessage: string; status: "failed"; storageLabel: string }
  | VersionedSessionReadyState<
      Content,
      Projection,
      Revision,
      LocalRevision,
      Location
    >;

export type PreparedVersionedSessionRemoval = {
  resume(): void;
};

export class VersionedSessionUnavailableError extends Error {
  constructor(label: string) {
    super(`${label} session is not ready.`);
    this.name = "VersionedSessionUnavailableError";
  }
}

export type VersionedSessionController<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
> = {
  canMutate(): boolean;
  discardPendingChangesAndReload(): Promise<void>;
  dispose(): void;
  flushPendingChanges(): Promise<void>;
  getState(): VersionedSessionState<
    Content,
    Projection,
    Revision,
    LocalRevision,
    Location
  >;
  loadConflictUnitIds(): Promise<string[]>;
  keepLocalConflictAndSynchronize(): Promise<void>;
  resolveConflictAndSynchronize(
    preference: VersionedContentConflictPreference,
    transform?: (
      prepared: PreparedVersionedContent<Content, Projection>,
      conflict: VersionedRepositoryConflictRecord<Content, Revision>,
      sources: PreparedVersionedConflictSources<Content, Projection>,
    ) => PreparedVersionedContent<Content, Projection>,
  ): Promise<void>;
  mutate(
    update: (
      current: PreparedVersionedContent<Content, Projection>,
    ) => PreparedVersionedContent<Content, Projection>,
  ): void;
  prepareForRemoval(): Promise<PreparedVersionedSessionRemoval>;
  reload(): Promise<void>;
  requestSync(): void;
  synchronizePendingChanges(): Promise<void>;
  start(): void;
  subscribe(listener: () => void): () => void;
  useRemoteConflictAndSynchronize(): Promise<void>;
};

type ActiveVersionedSession<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> = {
  generation: number;
  optimisticHead: PreparedVersionedContent<Content, Projection> | null;
  persistence: VersionedRepositoryPersistenceState<Revision>;
  persistedSnapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  queue: VersionedRepositorySaveQueue<Content, Projection, LocalRevision> | null;
};

function initialPersistenceState<Revision extends string>(
  snapshot: {
    conflictRevision: Revision | null;
    pendingChanges: boolean;
  },
): VersionedRepositoryPersistenceState<Revision> {
  if (snapshot.conflictRevision) {
    return {
      remoteRevision: snapshot.conflictRevision,
      status: "conflict",
    };
  }
  return snapshot.pendingChanges
    ? { status: "pending-sync" }
    : { status: "saved" };
}

export function createVersionedSessionController<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
  Location,
>({
  label,
  repository,
  scheduler,
}: {
  label: string;
  repository: VersionedRepository<
    Content,
    Revision,
    LocalRevision,
    Location,
    Projection
  > | null;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): VersionedSessionController<
  Content,
  Projection,
  Revision,
  LocalRevision,
  Location
> {
  type Session = ActiveVersionedSession<
    Content,
    Projection,
    Revision,
    LocalRevision
  >;
  type State = VersionedSessionState<
    Content,
    Projection,
    Revision,
    LocalRevision,
    Location
  >;
  type Snapshot = VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;

  const listeners = new Set<() => void>();
  let active: Session | null = null;
  let disposed = false;
  let generation = 0;
  let quiesced = false;
  let started = false;
  let transitionVersion = 0;
  let state: State = repository
    ? { status: "loading", storageLabel: repository.label }
    : { status: "unavailable" };

  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : `${label} session failed.`;
  const publish = (next: State) => {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  const canMutate = () =>
    !disposed &&
    !quiesced &&
    active?.queue !== null &&
    state.status === "ready";
  const requireActive = () => {
    if (!active?.queue || !canMutate()) {
      throw new VersionedSessionUnavailableError(label);
    }
    return active as Session & {
      queue: VersionedRepositorySaveQueue<Content, Projection, LocalRevision>;
    };
  };
  const publishReady = (session: Session) => {
    if (
      disposed ||
      active !== session ||
      session.generation !== generation ||
      !repository
    ) {
      return;
    }
    const snapshot = session.persistedSnapshot;
    const visible = session.optimisticHead ?? snapshot;

    publish({
      content: visible.content,
      location: repository.location,
      persistence: session.persistence,
      projection: visible.projection,
      snapshot,
      status: "ready",
      storageLabel: repository.label,
    });
  };
  const installQueue = (
    session: Session,
    persistence = session.persistence,
  ) => {
    if (!repository || active !== session || session.generation !== generation) {
      throw new VersionedSessionUnavailableError(label);
    }
    session.queue?.dispose();
    session.persistence = persistence;
    const expectedGeneration = session.generation;
    const queue = createVersionedRepositorySaveQueue({
      initialPersistenceState: persistence,
      initialSnapshot: session.persistedSnapshot,
      onSnapshotChanged(snapshot) {
        if (active !== session || generation !== expectedGeneration) return;
        session.persistedSnapshot = snapshot;
        session.optimisticHead = null;
        publishReady(session);
      },
      onPersistenceChange(nextPersistence) {
        if (active !== session || generation !== expectedGeneration) return;
        session.persistence = nextPersistence;
        publishReady(session);
      },
      repository,
      scheduler,
    });

    if (active !== session || generation !== expectedGeneration) {
      queue.dispose();
      return;
    }
    session.queue = queue;
  };
  const installSnapshot = (
    snapshot: Snapshot,
    expectedTransition: number,
  ) => {
    if (
      disposed ||
      transitionVersion !== expectedTransition ||
      !repository
    ) {
      return;
    }
    const session: Session = {
      generation: ++generation,
      optimisticHead: null,
      persistence: initialPersistenceState(snapshot),
      persistedSnapshot: snapshot,
      queue: null,
    };

    active?.queue?.dispose();
    active = session;
    quiesced = false;
    installQueue(session);
    publishReady(session);
  };
  const restoreQueueAfterFailedTransition = (
    session: Session,
  ) => {
    if (disposed || active !== session) return;
    if (!session.queue) {
      installQueue(session, session.persistence);
    }
    quiesced = false;
    publishReady(session);
  };
  const loadInitial = async () => {
    const expectedTransition = ++transitionVersion;

    active?.queue?.dispose();
    active = null;
    quiesced = false;
    if (!repository) {
      publish({ status: "unavailable" });
      return;
    }
    publish({ status: "loading", storageLabel: repository.label });
    try {
      installSnapshot(await repository.loadSnapshot(), expectedTransition);
    } catch (error) {
      if (!disposed && transitionVersion === expectedTransition) {
        publish({
          errorMessage: errorMessage(error),
          status: "failed",
          storageLabel: repository.label,
        });
      }
    }
  };
  const commitMutation = (
    session: Session & {
      queue: VersionedRepositorySaveQueue<Content, Projection, LocalRevision>;
    },
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
  ) => {
    session.optimisticHead = change.after;
    publishReady(session);
    session.queue.enqueue(change);
  };
  const mutate = (
    update: (
      current: PreparedVersionedContent<Content, Projection>,
    ) => PreparedVersionedContent<Content, Projection>,
  ) => {
    const session = requireActive();
    const current = session.optimisticHead ?? {
      content: session.persistedSnapshot.content,
      projection: session.persistedSnapshot.projection,
    };
    const before = {
      content: session.persistedSnapshot.content,
      projection: session.persistedSnapshot.projection,
    };
    const after = update(current);

    commitMutation(session, {
      after,
      baseLocalRevision: session.persistedSnapshot.localRevision,
      before,
    });
  };

  return {
    canMutate,
    async discardPendingChangesAndReload() {
      const session: Session = requireActive();
      const queue = session.queue!;
      const expectedTransition = ++transitionVersion;

      quiesced = true;
      try {
        await queue.prepareForDiscard();
        session.queue = null;
        const snapshot = await repository!.discardPendingSnapshotAndReload();

        installSnapshot(snapshot, expectedTransition);
      } catch (error) {
        if (!disposed && transitionVersion === expectedTransition) {
          restoreQueueAfterFailedTransition(session);
        }
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      transitionVersion += 1;
      quiesced = true;
      active?.queue?.dispose();
      active = null;
      listeners.clear();
    },
    flushPendingChanges() {
      if (!active || state.status !== "ready") {
        throw new VersionedSessionUnavailableError(label);
      }
      // A reload/removal transition may already have quiesced mutation and
      // detached a queue after reaching its local durability point. Flushing
      // remains safe in either case and must not reuse the mutation guard.
      return active.queue?.flushLocal() ?? Promise.resolve();
    },
    getState() {
      return state;
    },
    async loadConflictUnitIds() {
      if (!repository) {
        throw new VersionedSessionUnavailableError(label);
      }
      return (await repository.loadConflict())?.unitIds ?? [];
    },
    async keepLocalConflictAndSynchronize() {
      if (!repository) {
        throw new VersionedSessionUnavailableError(label);
      }
      const result = await repository.keepLocalConflictAndSynchronize();

      if (result.status === "conflict") {
        throw new Error("Remote content changed again while resolving conflict.");
      }
      await loadInitial();
    },
    async resolveConflictAndSynchronize(preference, transform) {
      if (!repository) {
        throw new VersionedSessionUnavailableError(label);
      }
      const result = await repository.resolveConflictAndSynchronize(
        preference,
        transform,
      );

      if (result.status === "conflict") {
        throw new Error("Remote content changed again while resolving conflict.");
      }
      await loadInitial();
    },
    mutate,
    async prepareForRemoval() {
      const session: Session = requireActive();
      const queue = session.queue!;

      quiesced = true;
      try {
        await queue.prepareForDiscard();
        session.queue = null;
      } catch (error) {
        quiesced = false;
        throw error;
      }
      let resumed = false;

      return {
        resume() {
          if (resumed || disposed || active !== session) return;
          resumed = true;
          restoreQueueAfterFailedTransition(session);
        },
      };
    },
    async reload() {
      if (state.status !== "ready" || !active) {
        await loadInitial();
        return;
      }
      const session: Session = requireActive();
      const queue = session.queue!;
      const expectedTransition = ++transitionVersion;

      try {
        await queue.flushLocal();
        if (queue.hasActiveSync()) {
          quiesced = true;
          await queue.prepareForReload();
          session.queue = null;
          const snapshot = await repository!.loadSnapshot();

          installSnapshot(snapshot, expectedTransition);
          return;
        }
        let observedRevision = queue.getLocalRevision();
        let snapshot = await repository!.loadSnapshot();

        while (
          !disposed &&
          transitionVersion === expectedTransition &&
          active === session
        ) {
          await queue.flushLocal();
          const nextRevision = queue.getLocalRevision();

          if (nextRevision === observedRevision) break;
          observedRevision = nextRevision;
          snapshot = await repository!.loadSnapshot();
        }
        if (
          disposed ||
          transitionVersion !== expectedTransition ||
          active !== session
        ) {
          return;
        }

        quiesced = true;
        const syncStartedDuringLoad = queue.hasActiveSync();
        await queue.prepareForReload();
        session.queue = null;
        if (syncStartedDuringLoad) {
          snapshot = await repository!.loadSnapshot();
        }
        installSnapshot(snapshot, expectedTransition);
      } catch (error) {
        if (!disposed && transitionVersion === expectedTransition) {
          restoreQueueAfterFailedTransition(session);
        }
        throw error;
      }
    },
    requestSync() {
      requireActive().queue.requestSync();
    },
    synchronizePendingChanges() {
      return requireActive().queue.synchronizePendingChanges();
    },
    start() {
      if (disposed || started) return;
      started = true;
      if (!active && repository) {
        void loadInitial();
      } else if (!repository) {
        publish({ status: "unavailable" });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async useRemoteConflictAndSynchronize() {
      if (!repository) {
        throw new VersionedSessionUnavailableError(label);
      }
      const result = await repository.resolveConflictAndSynchronize("remote");

      if (result.status === "conflict") {
        throw new Error("Remote content changed again while resolving conflict.");
      }
      await loadInitial();
    },
  };
}
