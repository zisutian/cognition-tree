// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepository,
  VersionedRepositorySnapshot,
} from "./versionedRepository";
import {
  createVersionedRepositorySaveQueue,
  type VersionedRepositoryPersistenceState,
  type VersionedRepositorySaveQueue,
} from "./versionedRepositorySaveQueue";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";

export type VersionedContentSessionState<
  Content,
  Revision extends string,
  LocalRevision extends string,
> =
  | { status: "unavailable" }
  | { status: "loading" }
  | { errorMessage: string; status: "failed" }
  | {
      content: Content;
      persistence: VersionedRepositoryPersistenceState<Revision>;
      snapshot: VersionedRepositorySnapshot<Content, Revision, LocalRevision>;
      status: "ready";
    };

export type VersionedContentSessionController<
  Content,
  Revision extends string,
  LocalRevision extends string,
> = {
  discardPendingChangesAndReload(): Promise<void>;
  flushPendingChanges(): Promise<void>;
  getState(): VersionedContentSessionState<Content, Revision, LocalRevision>;
  reload(): Promise<void>;
  requestSync(): void;
  start(): void;
  stop(): void;
  subscribe(listener: () => void): () => void;
  updateContent(update: (current: Content) => Content): void;
};

export function createVersionedContentSessionController<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
>({
  label,
  parseContent,
  repository,
  scheduler,
}: {
  label: string;
  parseContent(value: unknown): Content;
  repository: VersionedRepository<
    Content,
    Revision,
    LocalRevision,
    Location
  > | null;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): VersionedContentSessionController<Content, Revision, LocalRevision> {
  type Snapshot = VersionedRepositorySnapshot<Content, Revision, LocalRevision>;
  type Persistence = VersionedRepositoryPersistenceState<Revision>;
  type Queue = VersionedRepositorySaveQueue<Content, LocalRevision>;
  type ActiveSession = {
    content: Content;
    generation: number;
    persistence: Persistence;
    queue: Queue | null;
    snapshot: Snapshot;
  };
  type State = VersionedContentSessionState<Content, Revision, LocalRevision>;
  const listeners = new Set<() => void>();
  let active: ActiveSession | null = null;
  let generation = 0;
  let state: State = repository
    ? { status: "loading" }
    : { status: "unavailable" };
  const publish = (next: State) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const initialPersistence = (snapshot: Snapshot): Persistence => {
    if (snapshot.conflictRevision) {
      return {
        remoteRevision: snapshot.conflictRevision,
        status: "conflict",
      };
    }
    return snapshot.pendingChanges
      ? { status: "pending-sync" }
      : { status: "saved" };
  };
  const publishReady = (session: ActiveSession) => {
    if (active !== session || session.generation !== generation) return;
    publish({
      content: session.content,
      persistence: session.persistence,
      snapshot: { ...session.snapshot, content: session.content },
      status: "ready",
    });
  };
  const requireActive = () => {
    if (!active?.queue || state.status !== "ready") {
      throw new Error(`${label} session is not ready.`);
    }
    return active as ActiveSession & { queue: Queue };
  };
  const installSnapshot = (snapshot: Snapshot, expectedGeneration: number) => {
    if (generation !== expectedGeneration) return;
    const content = parseContent(snapshot.content);
    const session: ActiveSession = {
      content,
      generation: expectedGeneration,
      persistence: initialPersistence(snapshot),
      queue: null,
      snapshot: { ...snapshot, content },
    };

    active = session;
    const queue = createVersionedRepositorySaveQueue({
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
      onPersistenceChange(persistence) {
        if (active !== session || generation !== expectedGeneration) return;
        session.persistence = persistence;
        if (persistence.status === "saved") {
          session.snapshot = {
            ...session.snapshot,
            conflictRevision: null,
            pendingChanges: false,
          };
        } else if (persistence.status === "conflict") {
          session.snapshot = {
            ...session.snapshot,
            conflictRevision: persistence.remoteRevision,
            pendingChanges: true,
          };
        }
        publishReady(session);
      },
      onRemoteRevision(remoteRevision) {
        if (active === session && generation === expectedGeneration) {
          session.snapshot = { ...session.snapshot, remoteRevision };
        }
      },
      repository: repository!,
      scheduler,
    });

    if (active !== session || generation !== expectedGeneration) {
      queue.dispose();
      return;
    }
    session.queue = queue;
    publishReady(session);
  };
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : `${label} session failed.`;
  const load = async () => {
    const expectedGeneration = generation + 1;

    generation = expectedGeneration;
    active?.queue?.dispose();
    active = null;
    if (!repository) {
      publish({ status: "unavailable" });
      return;
    }
    publish({ status: "loading" });
    try {
      installSnapshot(await repository.loadSnapshot(), expectedGeneration);
    } catch (error) {
      if (generation === expectedGeneration) {
        publish({ errorMessage: errorMessage(error), status: "failed" });
      }
    }
  };

  return {
    async discardPendingChangesAndReload() {
      const session = requireActive();

      await session.queue.prepareForDiscard();
      const expectedGeneration = generation + 1;

      generation = expectedGeneration;
      active = null;
      publish({ status: "loading" });
      try {
        installSnapshot(
          await repository!.discardPendingSnapshotAndReload(),
          expectedGeneration,
        );
      } catch (error) {
        if (generation === expectedGeneration) {
          publish({ errorMessage: errorMessage(error), status: "failed" });
        }
      }
    },
    flushPendingChanges() {
      return requireActive().queue.flushLocal();
    },
    getState() {
      return state;
    },
    async reload() {
      if (active?.queue && state.status === "ready") {
        const session = active;
        const queue = session.queue;

        if (!queue) throw new Error(`${label} session is not ready.`);
        publish({ status: "loading" });
        try {
          await queue.prepareForReload();
        } catch (error) {
          publishReady(session);
          throw error;
        }
      }
      await load();
    },
    requestSync() {
      requireActive().queue.requestSync();
    },
    start() {
      void load();
    },
    stop() {
      generation += 1;
      active?.queue?.dispose();
      active = null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateContent(update) {
      const session = requireActive();
      const next = parseContent(update(session.content));

      session.content = next;
      session.snapshot = { ...session.snapshot, content: next };
      publishReady(session);
      session.queue.enqueue(next);
    },
  };
}
