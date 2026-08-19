// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import type {
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
  type PreparedWorkspaceRepositorySnapshot,
  type WorkspaceRepositoryCommitReceipt,
  type WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspace/revision.ts";
import {
  createWebDavPointer,
  createWebDavDeletionTombstone,
  parseWebDavCurrent,
  parseWebDavPointer,
  requireWebDavEtag,
  requireWebDavPointerResource,
  stringifyWebDavControlFile,
  webDavCurrentPath,
  webDavGenerationsPath,
  webDavLockPath,
} from "./webDavControlFiles.ts";
import { WebDavGenerationStore } from "./webDavGenerationStore.ts";
import {
  type ActiveWebDavLease,
  defaultWebDavLockLeaseMs,
  defaultWebDavLockRenewMs,
  WebDavRepositoryBusyError,
  WebDavWriterLeaseCoordinator,
} from "./webDavWriterLease.ts";
import {
  WebDavCapabilityError,
  WebDavRequestError,
  type WebDavTransport,
} from "./webDavTransport.ts";

export {
  webDavCurrentPath,
  webDavGenerationsPath,
  webDavLockPath,
} from "./webDavControlFiles.ts";
export { WebDavRepositoryBusyError } from "./webDavWriterLease.ts";

export const webDavCommitPhases = {
  leaseAcquired: "lease-acquired",
  generationUploaded: "generation-uploaded",
  generationValidated: "generation-validated",
  pointerCommitted: "pointer-committed",
  cleaned: "cleaned",
} as const;

export type WebDavCommitPhase =
  (typeof webDavCommitPhases)[keyof typeof webDavCommitPhases];

export type WebDavWorkspaceStoreOptions = {
  createId?: () => string;
  initialization:
    | Readonly<{
        content: WorkspaceRepositoryContentDto;
        mode: "initialize-empty";
      }>
    | Readonly<{ mode: "open-existing" }>;
  lockLeaseMs?: number;
  lockRenewMs?: number;
  now?: () => number;
  onCommitPhase?: (phase: WebDavCommitPhase) => Promise<void> | void;
  transport: WebDavTransport;
};

export type WebDavManagedDataDeletionResult = {
  deletionToken: string;
  status: "deleted" | "deleting";
};

function prepareWorkspaceWriteContent(
  content: WorkspaceRepositoryContentDto,
  previous?: WorkspaceRepositoryPreparation | null,
) {
  try {
    return prepareWorkspaceRepositoryContent(content, { previous });
  } catch (error) {
    throw new WorkspaceRepositoryContractError(
      "$.content",
      error instanceof Error ? error.message : "invalid workspace content",
    );
  }
}

export class WebDavWorkspaceStore implements WorkspaceRepositoryStore {
  #acceptingOperations = true;
  #closeForDeletionPromise: Promise<void> | null = null;
  readonly #createId: () => string;
  readonly #generationStore: WebDavGenerationStore;
  readonly #initialization: WebDavWorkspaceStoreOptions["initialization"];
  #initializePromise: Promise<void> | null = null;
  #lastPreparedSnapshot: PreparedWorkspaceRepositorySnapshot | null = null;
  readonly #leaseCoordinator: WebDavWriterLeaseCoordinator;
  readonly #now: () => number;
  readonly #onCommitPhase: NonNullable<WebDavWorkspaceStoreOptions["onCommitPhase"]>;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #transport: WebDavTransport;

  constructor({
    createId = randomUUID,
    initialization,
    lockLeaseMs = defaultWebDavLockLeaseMs,
    lockRenewMs = defaultWebDavLockRenewMs,
    now = Date.now,
    onCommitPhase = async () => {},
    transport,
  }: WebDavWorkspaceStoreOptions) {
    this.#createId = createId;
    this.#initialization = initialization;
    this.#now = now;
    this.#onCommitPhase = onCommitPhase;
    this.#transport = transport;
    this.#leaseCoordinator = new WebDavWriterLeaseCoordinator({
      createId,
      leaseMs: lockLeaseMs,
      now,
      renewMs: lockRenewMs,
      transport,
    });
    this.#generationStore = new WebDavGenerationStore({
      leaseCoordinator: this.#leaseCoordinator,
      now,
      transport,
    });
  }

  async initialize() {
    if (!this.#initializePromise) {
      this.#initializePromise = this.#ensureInitialized();
    }
    try {
      await this.#initializePromise;
    } catch (error) {
      this.#initializePromise = null;
      throw this.#mapFailure(error);
    }
  }

  async loadSnapshot() {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.initialize();
      try {
        return await this.#loadConsistentSnapshot();
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async commitSnapshot(commit: WorkspaceRepositoryCommitDto) {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.initialize();
      try {
        return await this.#commitSnapshot(commit, null);
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async commitPreparedSnapshot(
    commit: WorkspaceRepositoryCommitDto,
    preparation: WorkspaceRepositoryPreparation,
  ): Promise<WorkspaceRepositoryCommitReceipt> {
    this.#assertAcceptingOperations();

    return this.#enqueueOperation(async () => {
      await this.initialize();
      try {
        return await this.#commitSnapshot(commit, preparation);
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  deleteManagedData(
    deletionToken = this.#createId(),
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueManagedDataDeletion(deletionToken, false);
  }

  retryManagedDataDeletion(
    deletionToken: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueManagedDataDeletion(deletionToken, true);
  }

  #enqueueManagedDataDeletion(
    deletionToken: string,
    cleanupAfterPublish: boolean,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueOperation(async () => {
      try {
        return await this.#deleteManagedData(
          deletionToken,
          cleanupAfterPublish,
        );
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  closeForDeletion(): Promise<void> {
    if (!this.#closeForDeletionPromise) {
      this.#acceptingOperations = false;
      this.#closeForDeletionPromise = this.#operationQueue.then(() => undefined);
    }

    return this.#closeForDeletionPromise;
  }

  async #ensureInitialized() {
    const pointer = await this.#transport.readText(webDavCurrentPath);

    if (pointer) {
      const parsed = parseWebDavPointer(pointer);
      const content = await this.#generationStore.read(parsed);

      this.#prepareSnapshot(content, parsed.revision);
      return;
    }
    if (this.#initialization.mode === "open-existing") {
      throw new RepositoryCorruptError("WebDAV current pointer is missing");
    }

    const lease = await this.#leaseCoordinator.acquire();

    try {
      const concurrentlyPublished = await this.#transport.readText(webDavCurrentPath);

      if (concurrentlyPublished) {
        const parsed = parseWebDavPointer(concurrentlyPublished);
        const content = await this.#generationStore.read(parsed);

        this.#prepareSnapshot(content, parsed.revision);
        return;
      }
      const unmanagedEntries = (await this.#transport.listCollection(""))
        .filter((entry) => entry.path !== webDavLockPath);

      if (unmanagedEntries.length > 0) {
        throw new RepositoryCorruptError(
          "WebDAV target is not empty and has no v4 current pointer",
        );
      }
      await this.#transport.createCollection(webDavGenerationsPath);
      const content = this.#initialization.content;
      const revision = createWorkspaceRepositoryRevision(content);
      const preparation = prepareWorkspaceWriteContent(content);
      const generation = this.#createId();

      await this.#generationStore.upload(generation, content, lease);
      await this.#generationStore.validate(generation, revision);
      await this.#leaseCoordinator.assertHeld(lease);
      const etag = await this.#transport.writeText(
        webDavCurrentPath,
        stringifyWebDavControlFile(
          createWebDavPointer(generation, revision, this.#now()),
        ),
        { ifNoneMatch: "*" },
      );

      if (!etag) {
        throw new WebDavCapabilityError("WebDAV current pointer PUT returned no ETag");
      }
      this.#lastPreparedSnapshot = { content, projection: preparation, revision };
    } finally {
      await this.#leaseCoordinator.release(lease);
    }
  }

  async #deleteManagedData(
    deletionToken: string,
    cleanupAfterPublish: boolean,
  ): Promise<WebDavManagedDataDeletionResult> {
    if (deletionToken.length === 0) {
      throw new RepositoryAdapterError(
        "invalid_request",
        "WebDAV deletion token must not be empty",
      );
    }

    const lease = await this.#leaseCoordinator.acquire();

    try {
      const pointerResource = await requireWebDavPointerResource(this.#transport);
      const current = parseWebDavCurrent(pointerResource);

      if ("status" in current) {
        if (current.deletionToken !== deletionToken) {
          throw new WebDavRepositoryBusyError();
        }
        return cleanupAfterPublish
          ? await this.#cleanupDeletedGenerations(deletionToken, lease)
          : { deletionToken, status: "deleting" };
      }

      await this.#generationStore.read(current);
      await this.#leaseCoordinator.renew(lease);
      await this.#leaseCoordinator.assertHeld(lease);

      try {
        const etag = await this.#transport.writeText(
          webDavCurrentPath,
          stringifyWebDavControlFile(createWebDavDeletionTombstone(
            deletionToken,
            current.revision,
            this.#now(),
          )),
          { ifMatch: requireWebDavEtag(pointerResource, "current pointer") },
        );

        if (!etag) {
          throw new WebDavCapabilityError(
            "WebDAV deletion tombstone PUT returned no ETag",
          );
        }
      } catch (error) {
        return await this.#resolveFailedDeletionCas(
          deletionToken,
          error,
          cleanupAfterPublish,
          lease,
          pointerResource.etag,
        );
      }

      return cleanupAfterPublish
        ? await this.#cleanupDeletedGenerations(deletionToken, lease)
        : { deletionToken, status: "deleting" };
    } finally {
      await this.#leaseCoordinator.release(lease);
    }
  }

  async #resolveFailedDeletionCas(
    deletionToken: string,
    error: unknown,
    cleanupAfterPublish: boolean,
    lease: ActiveWebDavLease,
    previousPointerEtag: string | null,
  ): Promise<WebDavManagedDataDeletionResult> {
    let currentResource;
    let current;

    try {
      currentResource = await requireWebDavPointerResource(this.#transport);
      current = parseWebDavCurrent(currentResource);
    } catch {
      if (this.#isAmbiguousDeletionCasFailure(error)) {
        return { deletionToken, status: "deleting" };
      }
      throw error;
    }

    if ("status" in current) {
      if (current.deletionToken !== deletionToken) {
        throw new WebDavRepositoryBusyError();
      }
      return cleanupAfterPublish
        ? this.#cleanupDeletedGenerations(deletionToken, lease)
        : { deletionToken, status: "deleting" };
    }
    if (
      (error instanceof WebDavRequestError && error.statusCode === 412) ||
      currentResource.etag !== previousPointerEtag
    ) {
      throw new WorkspaceRevisionConflictError(current.revision);
    }
    if (this.#isAmbiguousDeletionCasFailure(error)) {
      return { deletionToken, status: "deleting" };
    }
    throw error;
  }

  #isAmbiguousDeletionCasFailure(error: unknown) {
    return !(error instanceof WebDavRequestError) ||
      error.statusCode === 408 ||
      error.statusCode >= 500;
  }

  async #cleanupDeletedGenerations(
    deletionToken: string,
    lease: ActiveWebDavLease,
  ): Promise<WebDavManagedDataDeletionResult> {
    const cleaned = await Promise.resolve()
      .then(async () => {
        await this.#leaseCoordinator.assertHeld(lease);
        const currentResource = await requireWebDavPointerResource(this.#transport);
        const current = parseWebDavCurrent(currentResource);

        if (!("status" in current) || current.deletionToken !== deletionToken) {
          throw new WebDavRepositoryBusyError();
        }
        await this.#transport.remove(webDavGenerationsPath);
        return true;
      })
      .catch(() => false);

    return {
      deletionToken,
      status: cleaned ? "deleted" : "deleting",
    };
  }

  async #commitSnapshot(
    commit: WorkspaceRepositoryCommitDto,
    prepared: WorkspaceRepositoryPreparation | null,
  ): Promise<WorkspaceRepositoryCommitReceipt> {
    const lease = await this.#leaseCoordinator.acquire();
    let generation: string | null = null;
    let pointerPublished = false;

    try {
      await this.#onCommitPhase(webDavCommitPhases.leaseAcquired);
      const pointerResource = await requireWebDavPointerResource(this.#transport);
      const pointer = parseWebDavPointer(pointerResource);
      const currentContent = await this.#generationStore.read(pointer);

      if (pointer.revision !== commit.baseRevision) {
        throw new WorkspaceRevisionConflictError(pointer.revision);
      }
      const before = this.#prepareSnapshot(currentContent, pointer.revision);
      const preparation = prepared ?? prepareWorkspaceWriteContent(
        commit.content,
        before.projection,
      );
      const revision = createWorkspaceRepositoryRevision(commit.content);

      if (revision === pointer.revision) {
        return { after: before, before, revision };
      }

      generation = this.#createId();
      await this.#generationStore.upload(generation, commit.content, lease);
      await this.#onCommitPhase(webDavCommitPhases.generationUploaded);
      await this.#generationStore.validate(generation, revision);
      await this.#onCommitPhase(webDavCommitPhases.generationValidated);
      await this.#leaseCoordinator.renew(lease);
      await this.#leaseCoordinator.assertHeld(lease);

      try {
        const etag = await this.#transport.writeText(
          webDavCurrentPath,
          stringifyWebDavControlFile(
            createWebDavPointer(generation, revision, this.#now()),
          ),
          { ifMatch: requireWebDavEtag(pointerResource, "current pointer") },
        );

        if (!etag) {
          throw new WebDavCapabilityError("WebDAV current pointer PUT returned no ETag");
        }
      } catch (error) {
        if (error instanceof WebDavRequestError && error.statusCode === 412) {
          const current = await requireWebDavPointerResource(this.#transport);
          throw new WorkspaceRevisionConflictError(
            parseWebDavPointer(current).revision,
          );
        }
        throw error;
      }

      pointerPublished = true;
      // Pointer CAS is the final commit point. Post-commit maintenance cannot
      // truthfully report the already-published content as a failed commit.
      await Promise.resolve()
        .then(() => this.#onCommitPhase(webDavCommitPhases.pointerCommitted))
        .catch(() => undefined);
      const cleaned = await this.#generationStore
        .garbageCollect(generation, lease)
        .then(() => true, () => false);

      if (cleaned) {
        await Promise.resolve()
          .then(() => this.#onCommitPhase(webDavCommitPhases.cleaned))
          .catch(() => undefined);
      }
      const after = {
        content: commit.content,
        projection: preparation,
        revision,
      };

      this.#lastPreparedSnapshot = after;
      return { after, before, revision };
    } catch (error) {
      const mustStopImmediately =
        error instanceof WebDavRepositoryBusyError ||
        error instanceof WorkspaceRevisionConflictError;

      if (generation && !pointerPublished && !mustStopImmediately) {
        await this.#transport
          .remove(`${webDavGenerationsPath}/${generation}`)
          .catch(() => false);
      }
      throw error;
    } finally {
      await this.#leaseCoordinator.release(lease);
    }
  }

  async #loadConsistentSnapshot(): Promise<PreparedWorkspaceRepositorySnapshot> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const firstResource = await requireWebDavPointerResource(this.#transport);
      const first = parseWebDavPointer(firstResource);
      const content = await this.#generationStore.read(first);
      const secondResource = await requireWebDavPointerResource(this.#transport);

      if (
        requireWebDavEtag(firstResource, "current pointer") ===
        requireWebDavEtag(secondResource, "current pointer")
      ) {
        return this.#prepareSnapshot(content, first.revision);
      }
    }

    throw new WebDavRepositoryBusyError();
  }

  #prepareSnapshot(
    content: WorkspaceRepositoryContentDto,
    revision: `sha256:${string}`,
  ): PreparedWorkspaceRepositorySnapshot {
    if (this.#lastPreparedSnapshot?.revision === revision) {
      return this.#lastPreparedSnapshot;
    }
    try {
      const snapshot = {
        content,
        projection: prepareWorkspaceRepositoryContent(content, {
          previous: this.#lastPreparedSnapshot?.projection,
        }),
        revision,
      };

      this.#lastPreparedSnapshot = snapshot;
      return snapshot;
    } catch {
      throw new RepositoryCorruptError("WebDAV repository content is invalid");
    }
  }

  #mapFailure(error: unknown) {
    if (
      error instanceof RepositoryAdapterError ||
      error instanceof WorkspaceRevisionConflictError ||
      error instanceof WorkspaceRepositoryContractError ||
      error instanceof UnsupportedRepositoryVersionError
    ) {
      return error;
    }
    if (error instanceof WebDavCapabilityError) {
      return new RepositoryAdapterError(
        "adapter_unavailable",
        "WebDAV capabilities are insufficient",
      );
    }
    if (error instanceof WebDavRequestError) {
      if (error.statusCode === 507) {
        return new RepositoryAdapterError(
          "insufficient_storage",
          "WebDAV storage is full",
        );
      }
      return new RepositoryAdapterError(
        "adapter_unavailable",
        "WebDAV repository request failed",
      );
    }
    if (error instanceof TypeError) {
      return new RepositoryAdapterError(
        "adapter_unavailable",
        "WebDAV repository is unavailable",
      );
    }
    return error;
  }

  #assertAcceptingOperations() {
    if (!this.#acceptingOperations) {
      throw new RepositoryAdapterError(
        "repository_not_found",
        "WebDAV repository connection is closing",
      );
    }
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
