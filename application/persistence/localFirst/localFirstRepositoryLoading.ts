// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositoryBackend,
} from "../versionedRepository";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";
import { canUseVersionedRepositoryCachedSnapshot } from "./localFirstRepositoryPolicy.ts";
import type {
  LocalFirstRepositoryRemoteReconciliationPort,
} from "./localFirstRepositoryRemoteReconciliation.ts";
import type { VersionedRepositoryCache } from "../versionedRepositoryCache";

export type VersionedRepositoryLoadPolicy =
  | Readonly<{ mode: "cache-first" }>
  | Readonly<{ mode: "refresh-remote" }>;

type LoadingProjectionPort<
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
  | "clearLocal"
  | "localProjection"
  | "prepareLocalState"
  | "prepareRemote"
  | "rememberLocal"
  | "rememberRemote"
  | "toSnapshot"
>;

type LocalFirstRepositoryLoadingOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> = Readonly<{
  backend: VersionedRepositoryBackend<Content, Revision>;
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createLocalRevision: () => LocalRevision;
  loadPolicy: VersionedRepositoryLoadPolicy;
  projections: LoadingProjectionPort<
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

export class LocalFirstRepositoryLoading<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> {
  readonly #backend: VersionedRepositoryBackend<Content, Revision>;
  readonly #cache: VersionedRepositoryCache<
    Content,
    Revision,
    LocalRevision
  >;
  readonly #createLocalRevision: () => LocalRevision;
  readonly #loadPolicy: VersionedRepositoryLoadPolicy;
  readonly #projections: LoadingProjectionPort<
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
    createLocalRevision,
    loadPolicy,
    projections,
    remoteReconciliation,
  }: LocalFirstRepositoryLoadingOptions<
    Content,
    Revision,
    LocalRevision,
    Projection
  >) {
    this.#backend = backend;
    this.#cache = cache;
    this.#createLocalRevision = createLocalRevision;
    this.#loadPolicy = loadPolicy;
    this.#projections = projections;
    this.#remoteReconciliation = remoteReconciliation;
  }

  async load(identity: string) {
    const local = await this.#cache.load(identity);

    if (local) {
      const localPrepared = this.#projections.prepareLocalState(local);
      if (this.#loadPolicy.mode === "cache-first") {
        return this.#projections.toSnapshot(local, localPrepared);
      }
      let remote;
      try {
        remote = await this.#backend.loadRemoteSnapshot();
      } catch (error) {
        if (canUseVersionedRepositoryCachedSnapshot(error)) {
          const fallback = await this.#cache.load(identity) ?? local;

          return this.#projections.toSnapshot(
            fallback,
            this.#projections.prepareLocalState(fallback),
          );
        }
        throw error;
      }
      const remotePrepared = remote.revision === local.remoteRevision
        ? {
            content: remote.content,
            projection: localPrepared.projection,
          }
        : this.#projections.prepareRemote(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );

      return this.#remoteReconciliation.reconcileRemoteSnapshot(
        identity,
        remote,
        remotePrepared,
      );
    }

    const remote = await this.#backend.loadRemoteSnapshot();
    const remotePrepared = this.#projections.prepareRemote(
      remote.content,
      remote.revision,
    );
    try {
      const state = await this.#cache.create({
        identity,
        localRevision: this.#createLocalRevision(),
        snapshot: remote,
      });

      this.#projections.rememberLocal(state, remotePrepared);
      this.#projections.rememberRemote(remote.revision, remotePrepared);
      return this.#projections.toSnapshot(state, remotePrepared);
    } catch (error) {
      const concurrentlyCreated = await this.#cache.load(identity);
      if (!concurrentlyCreated) {
        throw error;
      }
      this.#projections.clearLocal();
      return this.#projections.toSnapshot(
        concurrentlyCreated,
        this.#projections.prepareLocalState(concurrentlyCreated),
      );
    }
  }

  async discardPendingAndReload(identity: string) {
    const current = await this.#cache.load(identity);
    if (!current) {
      throw new Error("Local repository state disappeared before discard.");
    }
    const remote = await this.#backend.loadRemoteSnapshot();
    const remotePrepared = this.#projections.prepareRemote(
      remote.content,
      remote.revision,
      this.#projections.localProjection(),
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
  }
}
