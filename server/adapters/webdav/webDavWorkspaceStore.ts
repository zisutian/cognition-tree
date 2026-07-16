// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { UnsupportedRepositoryVersionError } from "../../../contracts/workspace-repository/contractValue.ts";
import { parseWorkspaceRepositoryCommit } from "../../../contracts/workspace-repository/parseRepository.ts";
import type {
  WorkspaceRepositorySnapshotDto,
} from "../../../contracts/workspace-repository/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../repository/repositoryStore.ts";
import {
  createEmptyRepositoryContent,
  workspaceFileName,
} from "../../repository/workspaceRepositoryLayout.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision.ts";
import {
  createWebDavPointer,
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
  initialWorkspaceId?: string;
  initialWorkspaceName?: string;
  lockLeaseMs?: number;
  lockRenewMs?: number;
  now?: () => number;
  onCommitPhase?: (phase: WebDavCommitPhase) => Promise<void> | void;
  transport: WebDavTransport;
};

export class WebDavWorkspaceStore implements WorkspaceRepositoryStore {
  readonly #createId: () => string;
  readonly #generationStore: WebDavGenerationStore;
  readonly #initialWorkspaceId: string;
  readonly #initialWorkspaceName: string;
  #initializePromise: Promise<void> | null = null;
  readonly #leaseCoordinator: WebDavWriterLeaseCoordinator;
  readonly #now: () => number;
  readonly #onCommitPhase: NonNullable<WebDavWorkspaceStoreOptions["onCommitPhase"]>;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #transport: WebDavTransport;

  constructor({
    createId = randomUUID,
    initialWorkspaceId = "webdav-workspace",
    initialWorkspaceName = "远端笔记库",
    lockLeaseMs = defaultWebDavLockLeaseMs,
    lockRenewMs = defaultWebDavLockRenewMs,
    now = Date.now,
    onCommitPhase = async () => {},
    transport,
  }: WebDavWorkspaceStoreOptions) {
    this.#createId = createId;
    this.#initialWorkspaceId = initialWorkspaceId;
    this.#initialWorkspaceName = initialWorkspaceName;
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
    return this.#enqueueOperation(async () => {
      await this.initialize();
      try {
        return await this.#loadConsistentSnapshot();
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async commitSnapshot(value: unknown) {
    const commit = parseWorkspaceRepositoryCommit(value);

    return this.#enqueueOperation(async () => {
      await this.initialize();
      try {
        return await this.#commitSnapshot(commit);
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async #ensureInitialized() {
    const pointer = await this.#transport.readText(webDavCurrentPath);

    if (pointer) {
      await this.#generationStore.read(parseWebDavPointer(pointer));
      return;
    }
    if (await this.#transport.readText(workspaceFileName)) {
      throw new UnsupportedRepositoryVersionError("$.schemaVersion", 2);
    }

    const lease = await this.#leaseCoordinator.acquire();

    try {
      const concurrentlyPublished = await this.#transport.readText(webDavCurrentPath);

      if (concurrentlyPublished) {
        await this.#generationStore.read(parseWebDavPointer(concurrentlyPublished));
        return;
      }
      if (await this.#transport.readText(workspaceFileName)) {
        throw new UnsupportedRepositoryVersionError("$.schemaVersion", 2);
      }
      const unmanagedEntries = (await this.#transport.listCollection(""))
        .filter((entry) => entry.path !== webDavLockPath);

      if (unmanagedEntries.length > 0) {
        throw new RepositoryCorruptError(
          "WebDAV target is not empty and has no v3 current pointer",
        );
      }
      await this.#transport.createCollection(webDavGenerationsPath);
      const content = createEmptyRepositoryContent(
        this.#initialWorkspaceId,
        this.#initialWorkspaceName,
      );
      const revision = createWorkspaceRepositoryRevision(content);
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
    } finally {
      await this.#leaseCoordinator.release(lease);
    }
  }

  async #commitSnapshot(
    commit: ReturnType<typeof parseWorkspaceRepositoryCommit>,
  ) {
    const lease = await this.#leaseCoordinator.acquire();
    let generation: string | null = null;
    let pointerPublished = false;

    try {
      await this.#onCommitPhase(webDavCommitPhases.leaseAcquired);
      const pointerResource = await requireWebDavPointerResource(this.#transport);
      const pointer = parseWebDavPointer(pointerResource);
      await this.#generationStore.read(pointer);

      if (pointer.revision !== commit.baseRevision) {
        throw new WorkspaceRevisionConflictError(pointer.revision);
      }
      const revision = createWorkspaceRepositoryRevision(commit.content);

      if (revision === pointer.revision) {
        return { revision };
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
      return { revision };
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

  async #loadConsistentSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const firstResource = await requireWebDavPointerResource(this.#transport);
      const first = parseWebDavPointer(firstResource);
      const content = await this.#generationStore.read(first);
      const secondResource = await requireWebDavPointerResource(this.#transport);

      if (
        requireWebDavEtag(firstResource, "current pointer") ===
        requireWebDavEtag(secondResource, "current pointer")
      ) {
        return { content, revision: first.revision };
      }
    }

    throw new WebDavRepositoryBusyError();
  }

  #mapFailure(error: unknown) {
    if (
      error instanceof RepositoryAdapterError ||
      error instanceof WorkspaceRevisionConflictError ||
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

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
