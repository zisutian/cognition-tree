import { createWorkspaceRepositoryRevision } from "./workspaceRepositoryRevision";
import {
  WorkspaceRepositoryConflictError,
  WorkspaceRepositoryUnavailableError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
  type WorkspaceRepositorySnapshot,
} from "./workspaceRepository";
import type {
  ConfirmedWorkspaceRepositorySnapshot,
  PendingWorkspaceRepositoryCommit,
  WorkspaceRepositoryCache,
  WorkspaceRepositoryCacheState,
} from "./workspaceRepositoryCache";

type ResilientWorkspaceRepositoryOptions = {
  cache: WorkspaceRepositoryCache;
  repository: WorkspaceRepository;
  repositoryIdentity: string;
};

function createCacheState(
  confirmed: ConfirmedWorkspaceRepositorySnapshot | null,
  pending: PendingWorkspaceRepositoryCommit | null,
): WorkspaceRepositoryCacheState {
  return { confirmed, pending, version: 1 };
}

function toConfirmedSnapshot(
  snapshot: Awaited<ReturnType<WorkspaceRepository["loadSnapshot"]>>,
): ConfirmedWorkspaceRepositorySnapshot {
  return {
    repositoryPath: snapshot.repositoryPath,
    revision: snapshot.revision,
    syntaxSourceFile: snapshot.syntaxSourceFile,
    workspace: snapshot.workspace,
  };
}

function toPendingSnapshot(
  pending: PendingWorkspaceRepositoryCommit,
  availability: "conflict" | "offline",
  currentRevision?: string,
): WorkspaceRepositorySnapshot {
  const base = {
    ...pending.content,
    repositoryPath: pending.repositoryPath,
    revision: pending.localRevision,
  };

  return availability === "conflict"
    ? {
        ...base,
        availability,
        currentRevision: currentRevision ?? pending.baseRevision,
      }
    : { ...base, availability };
}

export function createResilientWorkspaceRepository({
  cache,
  repository,
  repositoryIdentity,
}: ResilientWorkspaceRepositoryOptions): WorkspaceRepository {
  let operationQueue: Promise<void> = Promise.resolve();
  const enqueue = <Result>(operation: () => Promise<Result>) => {
    const result = operationQueue.then(operation);

    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const saveConfirmedBestEffort = async (
    confirmed: ConfirmedWorkspaceRepositorySnapshot,
  ) => {
    try {
      await cache.save(repositoryIdentity, createCacheState(confirmed, null));
    } catch {
      // A confirmed remote operation remains successful when local cache is unavailable.
    }
  };

  return {
    label: repository.label,
    commitSnapshot(commit) {
      return enqueue(async () => {
        const state = await cache.load(repositoryIdentity);
        const pending = state?.pending ?? null;
        const confirmed = state?.confirmed ?? null;

        if (pending && commit.baseRevision !== pending.localRevision) {
          throw new WorkspaceRepositoryConflictError(pending.localRevision);
        }
        if (
          !pending &&
          confirmed &&
          commit.baseRevision !== confirmed.revision
        ) {
          throw new WorkspaceRepositoryConflictError(confirmed.revision);
        }

        const baseRevision = pending?.baseRevision ?? commit.baseRevision;
        const content: WorkspaceRepositoryContent = {
          syntaxSourceFile: commit.syntaxSourceFile,
          workspace: commit.workspace,
        };
        const repositoryPath = pending?.repositoryPath ??
          confirmed?.repositoryPath;

        try {
          const result = await repository.commitSnapshot({
            ...content,
            baseRevision,
          });
          const nextConfirmed = repositoryPath
            ? { ...content, repositoryPath, revision: result.revision }
            : null;

          if (nextConfirmed) {
            await saveConfirmedBestEffort(nextConfirmed);
          } else {
            await cache.remove(repositoryIdentity);
          }
          return { availability: "online" as const, revision: result.revision };
        } catch (error) {
          if (
            !(error instanceof WorkspaceRepositoryUnavailableError) &&
            !(error instanceof WorkspaceRepositoryConflictError)
          ) {
            throw error;
          }

          if (!repositoryPath) {
            throw error;
          }

          const localRevision = await createWorkspaceRepositoryRevision(content);
          const nextPending: PendingWorkspaceRepositoryCommit = {
            baseRevision,
            content,
            localRevision,
            repositoryPath,
          };

          await cache.save(
            repositoryIdentity,
            createCacheState(confirmed, nextPending),
          );
          if (error instanceof WorkspaceRepositoryConflictError) {
            throw error;
          }

          return { availability: "offline" as const, revision: localRevision };
        }
      });
    },
    discardPendingCommit() {
      return enqueue(async () => {
        const state = await cache.load(repositoryIdentity);

        if (!state?.pending) {
          return;
        }

        if (state.confirmed) {
          await cache.save(
            repositoryIdentity,
            createCacheState(state.confirmed, null),
          );
        } else {
          await cache.remove(repositoryIdentity);
        }
      });
    },
    loadSnapshot() {
      return enqueue(async () => {
        const state = await cache.load(repositoryIdentity);

        let remoteSnapshot: Awaited<ReturnType<WorkspaceRepository["loadSnapshot"]>>;

        try {
          remoteSnapshot = await repository.loadSnapshot();
        } catch (error) {
          if (!(error instanceof WorkspaceRepositoryUnavailableError)) {
            throw error;
          }

          if (state?.pending) {
            return toPendingSnapshot(state.pending, "offline");
          }
          if (state?.confirmed) {
            return { ...state.confirmed, availability: "offline" as const };
          }
          throw error;
        }

        const confirmed = toConfirmedSnapshot(remoteSnapshot);

        if (!state?.pending) {
          await saveConfirmedBestEffort(confirmed);
          return { ...confirmed, availability: "online" as const };
        }

        const pending = state.pending;

        if (remoteSnapshot.revision !== pending.baseRevision) {
          const remoteContentRevision = await createWorkspaceRepositoryRevision({
            syntaxSourceFile: remoteSnapshot.syntaxSourceFile,
            workspace: remoteSnapshot.workspace,
          });

          if (remoteContentRevision === pending.localRevision) {
            await saveConfirmedBestEffort(confirmed);
            return { ...confirmed, availability: "online" as const };
          }

          await cache.save(
            repositoryIdentity,
            createCacheState(confirmed, pending),
          );
          return toPendingSnapshot(
            pending,
            "conflict",
            remoteSnapshot.revision,
          );
        }

        try {
          const result = await repository.commitSnapshot({
            ...pending.content,
            baseRevision: pending.baseRevision,
          });
          const synced = {
            ...pending.content,
            repositoryPath: remoteSnapshot.repositoryPath,
            revision: result.revision,
          };

          await saveConfirmedBestEffort(synced);
          return { ...synced, availability: "online" as const };
        } catch (error) {
          if (error instanceof WorkspaceRepositoryConflictError) {
            await cache.save(
              repositoryIdentity,
              createCacheState(confirmed, pending),
            );
            return toPendingSnapshot(
              pending,
              "conflict",
              error.currentRevision,
            );
          }
          if (error instanceof WorkspaceRepositoryUnavailableError) {
            await cache.save(
              repositoryIdentity,
              createCacheState(confirmed, pending),
            );
            return toPendingSnapshot(pending, "offline");
          }

          throw error;
        }
      });
    },
  };
}
