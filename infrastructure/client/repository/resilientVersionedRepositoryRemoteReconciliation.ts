// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  type PreparedVersionedContent,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
  type VersionedRemoteSnapshot,
} from "../../../application/persistence/versionedRepository";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";
import type {
  VersionedRepositoryCache,
  VersionedRepositoryLocalState,
} from "./versionedRepositoryCache";
import { versionedContentEqual } from "./resilientVersionedRepositoryPolicy.ts";

type RemoteProjectionPort<
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
  | "prepareLocalState"
  | "prepareMergeBase"
  | "prepareRemote"
  | "rememberLocal"
  | "rememberRemote"
  | "toSnapshot"
  | "toTransition"
>;

type LocalFirstRepositoryRemoteReconciliationOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Readonly<{
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createBusyError: () => Error;
  createLocalRevision: () => LocalRevision;
  mergeContent?: VersionedContentMergePolicy<Content, Projection>;
  preparation: VersionedContentPreparationPolicy<Content, Projection>;
  projections: RemoteProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
}>;

export class LocalFirstRepositoryRemoteReconciliation<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> {
  readonly #cache: VersionedRepositoryCache<
    Content,
    Revision,
    LocalRevision
  >;
  readonly #createBusyError: () => Error;
  readonly #createLocalRevision: () => LocalRevision;
  readonly #mergeContent?: VersionedContentMergePolicy<Content, Projection>;
  readonly #preparation: VersionedContentPreparationPolicy<Content, Projection>;
  readonly #projections: RemoteProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;

  constructor({
    cache,
    createBusyError,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
  }: LocalFirstRepositoryRemoteReconciliationOptions<
    Content,
    Revision,
    LocalRevision,
    Projection
  >) {
    this.#cache = cache;
    this.#createBusyError = createBusyError;
    this.#createLocalRevision = createLocalRevision;
    this.#mergeContent = mergeContent;
    this.#preparation = preparation;
    this.#projections = projections;
  }

  async reconcilePendingSnapshot(
    identity: string,
    current: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    currentPrepared: PreparedVersionedContent<Content, Projection>,
    remote: VersionedRemoteSnapshot<Content, Revision>,
    remotePrepared: PreparedVersionedContent<Content, Projection>,
  ) {
    const syncContext = await this.#cache.loadSyncContext(identity);
    const baseContent = syncContext?.baseContent;
    if (!baseContent) {
      throw new Error("Repository synchronization base is unavailable.");
    }
    const basePrepared = baseContent && this.#mergeContent
      ? this.#projections.prepareMergeBase(
          baseContent,
          current,
          currentPrepared,
          versionedContentEqual,
        )
      : null;
    const merged = basePrepared && this.#mergeContent
      ? this.#mergeContent(basePrepared, currentPrepared, remotePrepared)
      : {
          status: "conflict" as const,
          unitIds: ["repository"],
        };

    if (merged.status === "conflict") {
      const state = await this.#cache.recordConflict({
        baseContent,
        currentRemoteRevision: remote.revision,
        expectedLocalRevision: current.localRevision,
        identity,
        localRevision: this.#createLocalRevision(),
        localContent: current.content,
        remoteContent: remote.content,
        unitIds: merged.unitIds,
      });
      this.#projections.rememberLocal(state, currentPrepared);
      this.#projections.rememberRemote(remote.revision, remotePrepared);
      return this.#projections.toTransition(
        current.localRevision,
        state,
        currentPrepared,
      );
    }
    const mergedPrepared = merged;

    this.#preparation.validateTransition?.(remotePrepared, mergedPrepared);
    const state = await this.#cache.rebaseFromRemote({
      content: merged.content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: this.#createLocalRevision(),
      pendingChanges: !versionedContentEqual(merged.content, remote.content),
      snapshot: remote,
    });
    this.#projections.rememberLocal(state, mergedPrepared);
    this.#projections.rememberRemote(remote.revision, remotePrepared);
    return this.#projections.toTransition(
      current.localRevision,
      state,
      mergedPrepared,
    );
  }

  async installSynchronizedSnapshot(
    identity: string,
    submitted: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    submittedPrepared: PreparedVersionedContent<Content, Projection>,
    remote: VersionedRemoteSnapshot<Content, Revision>,
  ) {
    const remotePrepared = this.#projections.prepareRemote(
      remote.content,
      remote.revision,
      submittedPrepared.projection,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.#cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared during synchronization.",
        );
      }
      const currentPrepared = current.localRevision === submitted.localRevision
        ? submittedPrepared
        : this.#projections.prepareLocalState(
            current,
            submittedPrepared.projection,
          );
      const merged = current.localRevision === submitted.localRevision
        ? { ...remotePrepared, status: "merged" as const }
        : this.#mergeContent
          ? this.#mergeContent(submittedPrepared, currentPrepared, remotePrepared)
          : { status: "conflict" as const, unitIds: ["repository"] };

      try {
        if (merged.status === "conflict") {
          const conflicted = await this.#cache.recordConflict({
            baseContent: submitted.content,
            currentRemoteRevision: remote.revision,
            expectedLocalRevision: current.localRevision,
            identity,
            localRevision: this.#createLocalRevision(),
            localContent: current.content,
            remoteContent: remote.content,
            unitIds: merged.unitIds,
          });

          this.#projections.rememberLocal(conflicted, currentPrepared);
          this.#projections.rememberRemote(remote.revision, remotePrepared);
          return this.#projections.toTransition(
            current.localRevision,
            conflicted,
            currentPrepared,
          );
        }
        this.#preparation.validateTransition?.(remotePrepared, merged);
        const rebased = await this.#cache.rebaseFromRemote({
          content: merged.content,
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: current.localRevision === submitted.localRevision &&
              versionedContentEqual(merged.content, submitted.content)
            ? current.localRevision
            : this.#createLocalRevision(),
          pendingChanges: !versionedContentEqual(
            merged.content,
            remote.content,
          ),
          snapshot: remote,
        });

        this.#projections.rememberLocal(rebased, merged);
        this.#projections.rememberRemote(remote.revision, remotePrepared);
        return this.#projections.toTransition(
          current.localRevision,
          rebased,
          merged,
        );
      } catch (error) {
        if (
          error instanceof VersionedRepositoryLocalConflictError &&
          attempt + 1 < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    throw this.#createBusyError();
  }

  async reconcileRemoteSnapshot(
    identity: string,
    remote: VersionedRemoteSnapshot<Content, Revision>,
    remotePrepared: PreparedVersionedContent<Content, Projection>,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.#cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared during remote refresh.",
        );
      }
      const currentPrepared = this.#projections.prepareLocalState(current);
      if (current.pendingBaseRevision) {
        if (current.remoteRevision === remote.revision) {
          return this.#projections.toSnapshot(current, currentPrepared);
        }
        try {
          return (await this.reconcilePendingSnapshot(
            identity,
            current,
            currentPrepared,
            remote,
            remotePrepared,
          )).snapshot;
        } catch (error) {
          if (!(error instanceof VersionedRepositoryLocalConflictError)) {
            throw error;
          }
          continue;
        }
      }
      if (current.remoteRevision === remote.revision) {
        this.#projections.rememberRemote(remote.revision, remotePrepared);
        return this.#projections.toSnapshot(current, currentPrepared);
      }
      try {
        this.#preparation.validateTransition?.(
          currentPrepared,
          remotePrepared,
        );
        const state = await this.#cache.replaceFromRemote({
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: this.#createLocalRevision(),
          snapshot: remote,
        });

        this.#projections.rememberLocal(state, remotePrepared);
        this.#projections.rememberRemote(remote.revision, remotePrepared);
        return this.#projections.toSnapshot(state, remotePrepared);
      } catch (error) {
        if (!(error instanceof VersionedRepositoryLocalConflictError)) {
          throw error;
        }
      }
    }
    throw this.#createBusyError();
  }
}
