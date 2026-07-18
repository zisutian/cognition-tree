// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemLocalDraftRevision,
  SystemRepository,
  SystemRepositoryContent,
  SystemRepositoryPurpose,
  SystemRepositoryRevision,
  SystemRepositorySnapshot,
} from "../../storage/repository/systemRepository";
import { parseSystemRepositoryContent } from "../../storage/repository/systemRepository";
import {
  createVersionedRepositorySaveQueue,
  type VersionedRepositoryPersistenceState,
  type VersionedRepositorySaveQueue,
} from "./versionedRepositorySaveQueue";

export type SystemRepositoryPersistenceState =
  VersionedRepositoryPersistenceState<SystemRepositoryRevision>;

export type SystemRepositorySessionState =
  | { purpose: SystemRepositoryPurpose; status: "unavailable" }
  | { purpose: SystemRepositoryPurpose; status: "loading" }
  | {
      errorMessage: string;
      purpose: SystemRepositoryPurpose;
      status: "failed";
    }
  | {
      content: SystemRepositoryContent;
      persistence: SystemRepositoryPersistenceState;
      purpose: SystemRepositoryPurpose;
      snapshot: SystemRepositorySnapshot;
      status: "ready";
    };

type SystemSaveQueue = VersionedRepositorySaveQueue<
  SystemRepositoryContent,
  SystemLocalDraftRevision
>;

type ActiveSession = {
  content: SystemRepositoryContent;
  generation: number;
  persistence: SystemRepositoryPersistenceState;
  queue: SystemSaveQueue | null;
  snapshot: SystemRepositorySnapshot;
};

export type SystemRepositorySessionController = {
  discardPendingChangesAndReload(): Promise<void>;
  flushPendingChanges(): Promise<void>;
  getState(): SystemRepositorySessionState;
  reload(): Promise<void>;
  requestSync(): void;
  start(): void;
  stop(): void;
  subscribe(listener: () => void): () => void;
  updateContent(
    update: (current: SystemRepositoryContent) => SystemRepositoryContent,
  ): void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "System repository session failed.";
}

function initialPersistence(
  snapshot: SystemRepositorySnapshot,
): SystemRepositoryPersistenceState {
  if (snapshot.conflictRevision) {
    return {
      remoteRevision: snapshot.conflictRevision,
      status: "conflict",
    };
  }
  return snapshot.pendingChanges ? { status: "pending-sync" } : { status: "saved" };
}

export function createSystemRepositorySessionController({
  purpose,
  repository,
}: {
  purpose: SystemRepositoryPurpose;
  repository: SystemRepository | null;
}): SystemRepositorySessionController {
  const listeners = new Set<() => void>();
  let active: ActiveSession | null = null;
  let generation = 0;
  let state: SystemRepositorySessionState = repository
    ? { purpose, status: "loading" }
    : { purpose, status: "unavailable" };
  const publish = (next: SystemRepositorySessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const publishReady = (session: ActiveSession) => {
    if (active !== session || session.generation !== generation) {
      return;
    }
    publish({
      content: session.content,
      persistence: session.persistence,
      purpose,
      snapshot: { ...session.snapshot, content: session.content },
      status: "ready",
    });
  };
  const requireActive = () => {
    if (!active?.queue || state.status !== "ready") {
      throw new Error(`${purpose} repository session is not ready.`);
    }
    return active as ActiveSession & { queue: SystemSaveQueue };
  };
  const installSnapshot = (
    snapshot: SystemRepositorySnapshot,
    expectedGeneration: number,
  ) => {
    if (generation !== expectedGeneration) {
      return;
    }
    const content = parseSystemRepositoryContent(snapshot.content, purpose);
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
      onLocalStaged(_stagedContent, localRevision) {
        if (active !== session || generation !== expectedGeneration) {
          return;
        }
        session.snapshot = {
          ...session.snapshot,
          content: session.content,
          localRevision,
          pendingChanges: true,
        };
        publishReady(session);
      },
      onPersistenceChange(persistence) {
        if (active !== session || generation !== expectedGeneration) {
          return;
        }
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
    });

    if (active !== session || generation !== expectedGeneration) {
      queue.dispose();
      return;
    }
    session.queue = queue;
    publishReady(session);
  };
  const load = async () => {
    const expectedGeneration = generation + 1;

    generation = expectedGeneration;
    active?.queue?.dispose();
    active = null;
    if (!repository) {
      publish({ purpose, status: "unavailable" });
      return;
    }
    publish({ purpose, status: "loading" });
    try {
      const snapshot = await repository.loadSnapshot();

      installSnapshot(snapshot, expectedGeneration);
    } catch (error) {
      if (generation === expectedGeneration) {
        publish({
          errorMessage: getErrorMessage(error),
          purpose,
          status: "failed",
        });
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
      publish({ purpose, status: "loading" });
      try {
        const snapshot = await repository!.discardPendingSnapshotAndReload();

        installSnapshot(snapshot, expectedGeneration);
      } catch (error) {
        if (generation === expectedGeneration) {
          publish({
            errorMessage: getErrorMessage(error),
            purpose,
            status: "failed",
          });
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

        if (!queue) {
          throw new Error(`${purpose} repository session is not ready.`);
        }

        publish({ purpose, status: "loading" });
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
      const next = parseSystemRepositoryContent(update(session.content), purpose);

      session.content = next;
      session.snapshot = { ...session.snapshot, content: next };
      publishReady(session);
      session.queue.enqueue(next);
    },
  };
}
