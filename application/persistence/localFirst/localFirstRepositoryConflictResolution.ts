// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  type PreparedVersionedConflictRecovery,
  type PreparedVersionedConflictSources,
  type PreparedVersionedContent,
  type VersionedContentConflictPreference,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
  type VersionedRepositoryConflictProof,
  type VersionedRepositoryConflictRecord,
  type VersionedRepositorySyncResult,
} from "../versionedRepository";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";
import {
  normalizeVersionedConflictUnitIds,
  versionedContentEqual,
  versionedRepositoryErrorMessage,
} from "./localFirstRepositoryPolicy.ts";
import type {
  LocalFirstRepositorySynchronizationPort,
} from "./localFirstRepositorySynchronization.ts";
import type { VersionedRepositoryCache } from "../versionedRepositoryCache";

type ConflictResolutionProjectionPort<
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
  | "toTransition"
>;

type ConflictRecoveryTransform<
  Content,
  Revision extends string,
  Projection,
> = (
  prepared: PreparedVersionedContent<Content, Projection>,
  conflict: VersionedRepositoryConflictRecord<Content, Revision>,
  sources: PreparedVersionedConflictSources<Content, Projection>,
) => PreparedVersionedConflictRecovery<Content, Projection>;

type LocalFirstRepositoryConflictResolutionOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Readonly<{
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createLocalRevision: () => LocalRevision;
  mergeContent?: VersionedContentMergePolicy<Content, Projection>;
  preparation: VersionedContentPreparationPolicy<Content, Projection>;
  projections: ConflictResolutionProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  synchronization: LocalFirstRepositorySynchronizationPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
}>;

export class LocalFirstRepositoryConflictResolution<
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
  readonly #projections: ConflictResolutionProjectionPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  readonly #synchronization: LocalFirstRepositorySynchronizationPort<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;

  constructor({
    cache,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
    synchronization,
  }: LocalFirstRepositoryConflictResolutionOptions<
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
    this.#synchronization = synchronization;
  }

  async load(identity: string) {
    const [current, context] = await Promise.all([
      this.#cache.load(identity),
      this.#cache.loadSyncContext(identity),
    ]);

    if (!current) {
      throw new Error(
        "Local repository state disappeared while loading conflict details.",
      );
    }
    return context?.conflict
      ? {
          ...context.conflict,
          local: current.content,
          localRevision: current.localRevision,
        }
      : null;
  }

  async resolve(
    identity: string,
    proof: VersionedRepositoryConflictProof<Revision, LocalRevision>,
    preference: VersionedContentConflictPreference,
    transform?: ConflictRecoveryTransform<Content, Revision, Projection>,
  ) {
    const [current, context] = await Promise.all([
      this.#cache.load(identity),
      this.#cache.loadSyncContext(identity),
    ]);
    const conflict = context?.conflict;

    if (!current || !conflict) {
      throw new Error("Repository does not have a persisted conflict.");
    }
    if (current.localRevision !== proof.localRevision) {
      throw new VersionedRepositoryLocalConflictError(current.localRevision);
    }
    if (
      current.remoteRevision !== proof.remoteRevision ||
      conflict.remoteRevision !== proof.remoteRevision
    ) {
      throw new Error("Repository conflict proof is no longer current.");
    }
    const currentPrepared = this.#projections.prepareLocalState(current);
    const remotePrepared = this.#projections.prepareRemote(
      conflict.remote,
      conflict.remoteRevision,
      currentPrepared.projection,
    );
    const basePrepared = this.#mergeContent
      ? this.#projections.prepareMergeBase(
          conflict.base,
          current,
          currentPrepared,
          versionedContentEqual,
        )
      : null;
    const unresolved = basePrepared && this.#mergeContent
      ? this.#mergeContent(basePrepared, currentPrepared, remotePrepared)
      : { status: "conflict" as const, unitIds: ["repository"] };
    const liveUnitIds = unresolved.status === "conflict"
      ? normalizeVersionedConflictUnitIds(unresolved.unitIds)
      : [];
    const merged = unresolved.status === "merged"
      ? unresolved
      : basePrepared && this.#mergeContent
        ? this.#mergeContent(
            basePrepared,
            currentPrepared,
            remotePrepared,
            preference,
          )
        : {
            ...(preference === "local" ? currentPrepared : remotePrepared),
            status: "merged" as const,
          };

    if (merged.status !== "merged") {
      throw new Error("Repository conflict could not be resolved.");
    }
    const liveConflict = {
      ...conflict,
      local: current.content,
      unitIds: liveUnitIds,
    };
    const mergedPrepared = merged;
    const recovery = transform && liveUnitIds.length > 0
      ? transform(mergedPrepared, liveConflict, {
          local: currentPrepared,
          remote: remotePrepared,
        })
      : null;
    if (
      recovery &&
      JSON.stringify(
        normalizeVersionedConflictUnitIds(recovery.coveredUnitIds),
      ) !== JSON.stringify(liveUnitIds)
    ) {
      throw new Error(
        "Repository conflict recovery did not cover every discarded unit.",
      );
    }
    const contentPrepared = recovery?.prepared ?? mergedPrepared;
    const content = contentPrepared.content;

    this.#preparation.validateTransition?.(remotePrepared, contentPrepared);
    const rebased = await this.#cache.rebaseFromRemote({
      content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: this.#createLocalRevision(),
      pendingChanges: !versionedContentEqual(content, conflict.remote),
      snapshot: {
        content: conflict.remote,
        revision: conflict.remoteRevision,
      },
    });
    this.#projections.rememberLocal(rebased, contentPrepared);
    this.#projections.rememberRemote(conflict.remoteRevision, remotePrepared);
    const resolvedTransition = this.#projections.toTransition(
      current.localRevision,
      rebased,
      contentPrepared,
    );
    let synchronized: VersionedRepositorySyncResult<
      Content,
      Projection,
      Revision,
      LocalRevision
    >;

    try {
      synchronized = await this.#synchronization.synchronize(identity);
    } catch (error) {
      const latest = await this.#cache.load(identity);

      if (!latest) throw error;
      const latestTransition = latest.localRevision === rebased.localRevision
        ? null
        : this.#projections.toTransition(
            rebased.localRevision,
            latest,
            this.#projections.prepareLocalState(
              latest,
              contentPrepared.projection,
            ),
          );
      const recoveryTransitions: VersionedRepositorySyncResult<
        Content,
        Projection,
        Revision,
        LocalRevision
      >["transitions"] = latestTransition
        ? [resolvedTransition, latestTransition]
        : [resolvedTransition];

      return {
        message: versionedRepositoryErrorMessage(error),
        status: "sync-error" as const,
        transitions: recoveryTransitions,
      };
    }
    const transitions: VersionedRepositorySyncResult<
      Content,
      Projection,
      Revision,
      LocalRevision
    >["transitions"] = [
      resolvedTransition,
      ...synchronized.transitions,
    ];

    return {
      ...synchronized,
      transitions,
    };
  }
}
