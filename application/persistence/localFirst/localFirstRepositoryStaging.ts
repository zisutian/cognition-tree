// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryLocalMergeConflictError,
  type PreparedVersionedContent,
  type PreparedVersionedContentChange,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
} from "../versionedRepository.ts";
import type { VersionedRepositoryCache } from "../versionedRepositoryCache.ts";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";
import { versionedContentEqual } from "./localFirstRepositoryPolicy.ts";

type LocalFirstRepositoryStagingOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Readonly<{
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createLocalRevision: () => LocalRevision;
  mergeContent?: VersionedContentMergePolicy<Content, Projection>;
  preparation: VersionedContentPreparationPolicy<Content, Projection>;
  projections: Pick<LocalFirstRepositoryProjectionPort<
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
    | "toTransition"
  >;
}>;

export class LocalFirstRepositoryStaging<
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
  readonly #createLocalRevision: () => LocalRevision;
  readonly #mergeContent?: VersionedContentMergePolicy<Content, Projection>;
  readonly #preparation: VersionedContentPreparationPolicy<Content, Projection>;
  readonly #projections: Pick<LocalFirstRepositoryProjectionPort<
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
    | "toTransition"
  >;

  constructor({
    cache,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
  }: LocalFirstRepositoryStagingOptions<
    Content,
    Revision,
    LocalRevision,
    Projection
  >) {
    this.#cache = cache;
    this.#createLocalRevision = createLocalRevision;
    this.#mergeContent = mergeContent;
    this.#preparation = preparation;
    this.#projections = projections;
  }

  async stage(
    identity: string,
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
  ) {
    let latestConflict: VersionedRepositoryLocalConflictError<LocalRevision>
      | null = null;

    this.#preparation.validateTransition?.(change.before, change.after);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.#cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared before staging.",
        );
      }
      const currentPrepared = this.#projections.prepareLocalState(
        current,
        change.before.projection,
      );
      const nextPrepared = this.#continuePreparedChange(
        change,
        current.localRevision,
        currentPrepared,
      );

      this.#preparation.validateTransition?.(currentPrepared, nextPrepared);
      const syncContext = await this.#cache.loadSyncContext(identity);
      if (!current.pendingBaseRevision && current.remoteRevision) {
        this.#projections.rememberRemote(
          current.remoteRevision,
          currentPrepared,
        );
      }
      try {
        if (syncContext?.conflict) {
          const remotePrepared = this.#projections.prepareRemote(
            syncContext.conflict.remote,
            syncContext.conflict.remoteRevision,
            nextPrepared.projection,
          );
          const basePrepared = this.#mergeContent
            ? this.#projections.prepareMergeBase(
                syncContext.conflict.base,
                current,
                nextPrepared,
                versionedContentEqual,
              )
            : null;
          const unresolved = basePrepared && this.#mergeContent
            ? this.#mergeContent(basePrepared, nextPrepared, remotePrepared)
            : { status: "conflict" as const, unitIds: ["repository"] };

          if (unresolved.status === "merged") {
            this.#preparation.validateTransition?.(
              remotePrepared,
              unresolved,
            );
            const state = await this.#cache.rebaseFromRemote({
              content: unresolved.content,
              expectedLocalRevision: current.localRevision,
              identity,
              localRevision: this.#createLocalRevision(),
              pendingChanges: !versionedContentEqual(
                unresolved.content,
                syncContext.conflict.remote,
              ),
              snapshot: {
                content: syncContext.conflict.remote,
                revision: syncContext.conflict.remoteRevision,
              },
            });

            this.#projections.rememberLocal(state, unresolved);
            return this.#projections.toTransition(
              current.localRevision,
              state,
              unresolved,
            );
          }
          const state = await this.#cache.stage({
            conflictUnitIds: unresolved.unitIds,
            content: nextPrepared.content,
            expectedLocalRevision: current.localRevision,
            identity,
            localRevision: this.#createLocalRevision(),
          });

          this.#projections.rememberLocal(state, nextPrepared);
          return this.#projections.toTransition(
            current.localRevision,
            state,
            nextPrepared,
          );
        }
        const state = await this.#cache.stage({
          conflictUnitIds: null,
          content: nextPrepared.content,
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: this.#createLocalRevision(),
        });

        this.#projections.rememberLocal(state, nextPrepared);
        return this.#projections.toTransition(
          current.localRevision,
          state,
          nextPrepared,
        );
      } catch (error) {
        if (!(error instanceof VersionedRepositoryLocalConflictError)) {
          throw error;
        }
        latestConflict = error;
      }
    }
    throw latestConflict ?? new Error(
      "Local repository state kept changing during staging.",
    );
  }

  #continuePreparedChange(
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
    currentLocalRevision: LocalRevision,
    current: PreparedVersionedContent<Content, Projection>,
  ): PreparedVersionedContent<Content, Projection> {
    if (change.baseLocalRevision === currentLocalRevision) {
      if (!versionedContentEqual(change.before.content, current.content)) {
        throw new VersionedRepositoryLocalMergeConflictError(["repository"]);
      }
      return change.after;
    }
    const merged = this.#mergeContent
      ? this.#mergeContent(change.before, change.after, current)
      : { status: "conflict" as const, unitIds: ["repository"] };

    if (merged.status === "conflict") {
      throw new VersionedRepositoryLocalMergeConflictError(merged.unitIds);
    }
    return merged;
  }
}
