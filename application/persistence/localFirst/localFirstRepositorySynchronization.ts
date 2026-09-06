// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryLocalConflictError,
  type VersionedContentPreparationPolicy,
  type VersionedRepositoryBackend,
  type VersionedRepositorySnapshotTransition,
  type VersionedRepositorySyncResult,
} from "../versionedRepository.ts";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";
import type {
  LocalFirstRepositoryRemoteReconciliationPort,
} from "./localFirstRepositoryRemoteReconciliation.ts";
import {
  isRetryableVersionedRepositoryRemoteError,
  versionedRepositoryErrorMessage,
} from "./localFirstRepositoryPolicy.ts";
import type { VersionedRepositoryCache } from "../versionedRepositoryCache.ts";

type SynchronizationProjectionPort<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Pick<LocalFirstRepositoryProjectionPort<
  Content,
  Revision,
  LocalRevision,
  Projection
>,
  | "clearRemoteBase"
  | "prepare"
  | "prepareLocalState"
  | "prepareRemote"
  | "readRemoteBase"
  | "rememberRemote"
  | "toTransition"
>;

type LocalFirstRepositorySynchronizationOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Readonly<{
  backend: VersionedRepositoryBackend<Content, Revision>;
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createBusyError: () => Error;
  createLocalRevision: () => LocalRevision;
  preparation: VersionedContentPreparationPolicy<Content, Projection>;
  projections: SynchronizationProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  remoteReconciliation: LocalFirstRepositoryRemoteReconciliationPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
}>;

export interface LocalFirstRepositorySynchronizationPort<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> {
  synchronize(identity: string): Promise<VersionedRepositorySyncResult<
    Content,
    Projection,
    Revision,
    LocalRevision
  >>;
}

export class LocalFirstRepositorySynchronization<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> implements LocalFirstRepositorySynchronizationPort<
  Content,
  Revision,
  LocalRevision,
  Projection
> {
  readonly #backend: VersionedRepositoryBackend<Content, Revision>;
  readonly #cache: VersionedRepositoryCache<
    Content,
    Revision,
    LocalRevision
  >;
  readonly #createBusyError: () => Error;
  readonly #createLocalRevision: () => LocalRevision;
  readonly #preparation: VersionedContentPreparationPolicy<Content, Projection>;
  readonly #projections: SynchronizationProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  readonly #remoteReconciliation:
    LocalFirstRepositoryRemoteReconciliationPort<
      Content,
      Revision,
      LocalRevision,
      Projection
    >;

  constructor({
    backend,
    cache,
    createBusyError,
    createLocalRevision,
    preparation,
    projections,
    remoteReconciliation,
  }: LocalFirstRepositorySynchronizationOptions<
    Content,
    Revision,
    LocalRevision,
    Projection
  >) {
    this.#backend = backend;
    this.#cache = cache;
    this.#createBusyError = createBusyError;
    this.#createLocalRevision = createLocalRevision;
    this.#preparation = preparation;
    this.#projections = projections;
    this.#remoteReconciliation = remoteReconciliation;
  }

  async synchronize(identity: string): Promise<VersionedRepositorySyncResult<
    Content,
    Projection,
    Revision,
    LocalRevision
  >> {
    type SnapshotTransition = VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >;
    type SyncResult = VersionedRepositorySyncResult<
      Content,
      Projection,
      Revision,
      LocalRevision
    >;
    const transitions: SnapshotTransition[] = [];
    const complete = (
      transition: SnapshotTransition,
      result:
        | { status: "conflict" | "offline" | "synced" }
        | { message: string; status: "sync-error" },
    ): SyncResult => {
      const [first, ...remaining] = transitions;
      const completedTransitions: SyncResult["transitions"] = first
        ? [first, ...remaining, transition]
        : [transition];

      switch (result.status) {
        case "conflict":
          return { status: "conflict", transitions: completedTransitions };
        case "offline":
          return { status: "offline", transitions: completedTransitions };
        case "synced":
          return { status: "synced", transitions: completedTransitions };
        case "sync-error":
          return {
            message: result.message,
            status: "sync-error",
            transitions: completedTransitions,
          };
      }
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const local = await this.#cache.load(identity);

      if (!local) {
        throw new Error(
          "Local repository state disappeared during synchronization.",
        );
      }
      if (!local.pendingBaseRevision) {
        return complete(this.#projections.toTransition(
          local.localRevision,
          local,
        ), {
          status: "synced",
        });
      }
      const localPrepared = this.#projections.prepareLocalState(local);
      const syncContext = await this.#cache.loadSyncContext(identity);
      const preparedBase = this.#projections.readRemoteBase(
        local.pendingBaseRevision,
      );

      if (
        this.#preparation.validateTransition &&
        syncContext?.baseContent &&
        !preparedBase
      ) {
        const basePrepared = this.#projections.prepare(
          syncContext.baseContent,
          localPrepared.projection,
        );

        this.#preparation.validateTransition(basePrepared, localPrepared);
        this.#projections.rememberRemote(
          local.pendingBaseRevision,
          basePrepared,
        );
      } else if (this.#preparation.validateTransition && preparedBase) {
        this.#preparation.validateTransition(preparedBase, localPrepared);
      }
      try {
        if (!syncContext?.baseContent) {
          throw new Error("Repository synchronization base is unavailable.");
        }
        const synchronized = await this.#backend.synchronizeRemoteSnapshot({
          base: {
            content: syncContext.baseContent,
            revision: local.pendingBaseRevision,
          },
          content: local.content,
        });
        const transition =
          await this.#remoteReconciliation.installSynchronizedSnapshot(
            identity,
            local,
            localPrepared,
            synchronized.snapshot,
          );
        if (transition.snapshot.conflictRevision !== null) {
          return complete(transition, {
            status: "conflict",
          });
        }
        return complete(transition, {
          status: "synced",
        });
      } catch (error) {
        if (error instanceof VersionedRepositoryBackendMergeConflictError) {
          this.#projections.clearRemoteBase();
          let remote;

          try {
            remote = await this.#backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableVersionedRepositoryRemoteError(loadError)) {
              throw loadError;
            }
            const current = await this.#cache.load(identity);
            if (!current) throw loadError;
            return complete(this.#projections.toTransition(
              current.localRevision,
              current,
              this.#projections.prepareLocalState(
                current,
                localPrepared.projection,
              ),
            ), {
              message: versionedRepositoryErrorMessage(loadError),
              status: "sync-error",
            });
          }
          if (remote.revision !== error.currentRevision) {
            if (attempt + 1 < 3) continue;
            throw this.#createBusyError();
          }
          const current = await this.#cache.load(identity);

          if (!current || !syncContext?.baseContent) {
            throw new Error(
              "Local repository state disappeared during conflict recovery.",
            );
          }
          if (current.localRevision !== local.localRevision) {
            if (attempt + 1 < 3) continue;
            throw this.#createBusyError();
          }
          try {
            const conflicted = await this.#cache.recordConflict({
              baseContent: syncContext.baseContent,
              currentRemoteRevision: remote.revision,
              expectedLocalRevision: current.localRevision,
              identity,
              localRevision: this.#createLocalRevision(),
              localContent: current.content,
              remoteContent: remote.content,
              unitIds: error.unitIds,
            });

            return complete(this.#projections.toTransition(
              current.localRevision,
              conflicted,
              localPrepared,
            ), {
              status: "conflict",
            });
          } catch (recordError) {
            if (
              recordError instanceof VersionedRepositoryLocalConflictError &&
              attempt + 1 < 3
            ) {
              continue;
            }
            throw recordError;
          }
        }
        if (error instanceof VersionedRepositoryBackendConflictError) {
          const conflictRevision = error.currentRevision as Revision;
          let remote;

          this.#projections.clearRemoteBase();

          try {
            remote = await this.#backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableVersionedRepositoryRemoteError(loadError)) {
              throw loadError;
            }
            const current = await this.#cache.load(identity);
            if (!current) throw loadError;

            return complete(this.#projections.toTransition(
              current.localRevision,
              current,
              this.#projections.prepareLocalState(
                current,
                localPrepared.projection,
              ),
            ), {
              message: versionedRepositoryErrorMessage(loadError),
              status: "sync-error",
            });
          }

          if (remote.revision !== conflictRevision) {
            if (attempt + 1 < 3) continue;
            throw this.#createBusyError();
          }
          const remotePrepared = this.#projections.prepareRemote(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );
          let transition;
          try {
            transition =
              await this.#remoteReconciliation.reconcilePendingSnapshot(
                identity,
                local,
                localPrepared,
                remote,
                remotePrepared,
              );
          } catch (rebaseError) {
            if (
              rebaseError instanceof VersionedRepositoryLocalConflictError &&
              attempt + 1 < 3
            ) {
              continue;
            }
            throw rebaseError;
          }
          if (transition.snapshot.conflictRevision !== null) {
            return complete(transition, {
              status: "conflict",
            });
          }
          transitions.push(transition);
          continue;
        }
        const current = await this.#cache.load(identity);
        if (!current) throw error;
        const transition = this.#projections.toTransition(
          current.localRevision,
          current,
          this.#projections.prepareLocalState(
            current,
            localPrepared.projection,
          ),
        );
        if (isRetryableVersionedRepositoryRemoteError(error)) {
          return complete(transition, {
            status: "offline",
          });
        }
        return complete(transition, {
          message: versionedRepositoryErrorMessage(error),
          status: "sync-error",
        });
      }
    }
    throw this.#createBusyError();
  }
}
