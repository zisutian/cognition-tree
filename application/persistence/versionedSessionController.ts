// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type {
  VersionedRepository,
  VersionedRepositorySnapshot,
} from "./versionedRepository";
import {
  createVersionedRepositorySaveQueue,
  type VersionedRepositoryPersistenceState,
  type VersionedRepositorySaveQueue,
} from "./versionedRepositorySaveQueue";

export type PreparedVersionedContent<Content, Projection> = {
  content: Content;
  projection: Projection;
};

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
  snapshot: VersionedRepositorySnapshot<Content, Revision, LocalRevision>;
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
  mutate(update: (current: Content) => Content): void;
  mutateAndFlush(update: (current: Content) => Content): Promise<void>;
  prepareForRemoval(): Promise<PreparedVersionedSessionRemoval>;
  reload(): Promise<void>;
  requestSync(): void;
  start(): void;
  subscribe(listener: () => void): () => void;
};

type ActiveVersionedSession<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> = {
  content: Content;
  generation: number;
  persistence: VersionedRepositoryPersistenceState<Revision>;
  projection: Projection;
  queue: VersionedRepositorySaveQueue<Content, LocalRevision> | null;
  snapshot: VersionedRepositorySnapshot<Content, Revision, LocalRevision>;
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
  parseContent,
  prepareContent,
  repository,
  scheduler,
}: {
  label: string;
  parseContent(value: unknown): Content;
  prepareContent(content: Content): Projection;
  repository: VersionedRepository<
    Content,
    Revision,
    LocalRevision,
    Location
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
    LocalRevision
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
      queue: VersionedRepositorySaveQueue<Content, LocalRevision>;
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
    publish({
      content: session.content,
      location: repository.location,
      persistence: session.persistence,
      projection: session.projection,
      snapshot: { ...session.snapshot, content: session.content },
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
      initialSnapshot: session.snapshot,
      onLocalStaged(_content, localRevision) {
        if (active !== session || generation !== expectedGeneration) return;
        session.snapshot = {
          ...session.snapshot,
          content: session.content,
          localRevision,
          pendingChanges: true,
        };
        publishReady(session);
      },
      onPersistenceChange(nextPersistence) {
        if (active !== session || generation !== expectedGeneration) return;
        session.persistence = nextPersistence;
        if (nextPersistence.status === "saved") {
          session.snapshot = {
            ...session.snapshot,
            conflictRevision: null,
            pendingChanges: false,
          };
        } else if (nextPersistence.status === "conflict") {
          session.snapshot = {
            ...session.snapshot,
            conflictRevision: nextPersistence.remoteRevision,
            pendingChanges: true,
          };
        } else if (nextPersistence.status === "offline") {
          session.snapshot = {
            ...session.snapshot,
            pendingChanges: nextPersistence.pendingChanges,
          };
        }
        publishReady(session);
      },
      onRemoteRevision(remoteRevision) {
        if (active === session && generation === expectedGeneration) {
          session.snapshot = { ...session.snapshot, remoteRevision };
        }
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
  const prepareSnapshot = (snapshot: Snapshot) => {
    const content = parseContent(snapshot.content);

    return {
      content,
      projection: prepareContent(content),
      snapshot: { ...snapshot, content },
    };
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
    const prepared = prepareSnapshot(snapshot);
    const session: Session = {
      content: prepared.content,
      generation: ++generation,
      persistence: initialPersistenceState(prepared.snapshot),
      projection: prepared.projection,
      queue: null,
      snapshot: prepared.snapshot,
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
  const mutate = (update: (current: Content) => Content) => {
    const session = requireActive();
    const content = parseContent(update(session.content));
    const projection = prepareContent(content);

    session.content = content;
    session.projection = projection;
    session.snapshot = {
      ...session.snapshot,
      content,
      pendingChanges: true,
    };
    publishReady(session);
    session.queue.enqueue(content);
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
      return requireActive().queue.flushLocal();
    },
    getState() {
      return state;
    },
    mutate,
    async mutateAndFlush(update) {
      mutate(update);
      await requireActive().queue.flushLocal();
    },
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
  };
}
