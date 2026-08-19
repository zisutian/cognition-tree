// SPDX-License-Identifier: GPL-3.0-or-later

import { parsePortableName } from "../../core/naming/portableName";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import type { ActiveRepositorySelection } from "./activeRepositorySelection";
import {
  reuseUnchangedRepositoryDescriptors,
  selectRepositoryAfterDeletion,
  type CreateRepositoryRequest,
  type DeleteRepositoryRequest,
  type RenameRepositoryRequest,
  type RepositoryCatalogOperation,
  type RepositoryCatalogState,
} from "./repositoryCatalog";
import type {
  RepositoryDeletionResult,
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
  WorkspaceRepositoryDescriptor,
} from "./workspaceRepositoryCatalog";

export const repositoryDeletionPollDelayMs = 1_000;

export type RepositoryCatalogControllerSnapshot = {
  activeDescriptor: WorkspaceRepositoryDescriptor | null;
  catalogLabel: string;
  state: RepositoryCatalogState;
};

export type RepositoryCatalogController = {
  createRepository(input: CreateRepositoryRequest): Promise<WorkspaceRepositoryDescriptor>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<RepositoryDeletionResult>;
  getSnapshot(): RepositoryCatalogControllerSnapshot;
  reload(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<void>;
  selectRepository(repositoryId: string): Promise<void>;
  start(): void;
  stop(): void;
  subscribe(listener: () => void): () => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository catalog failed.";
}

export function createRepositoryCatalogController({
  activeRepositorySelection,
  catalog,
  provisionRepository,
  scheduler,
}: {
  activeRepositorySelection: ActiveRepositorySelection;
  catalog: WorkspaceRepositoryCatalog;
  provisionRepository(
    input: CreateRepositoryRequest,
    label: string,
  ): Promise<WorkspaceRepositoryDescriptor>;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): RepositoryCatalogController {
  const listeners = new Set<() => void>();
  let cancelDeletionPoll: (() => void) | null = null;
  let operation: RepositoryCatalogOperation = "idle";
  let started = false;
  let snapshot: RepositoryCatalogControllerSnapshot = {
    activeDescriptor: null,
    catalogLabel: catalog.label,
    state: { status: "loading" },
  };

  const projectSnapshot = (
    state: RepositoryCatalogState,
  ): RepositoryCatalogControllerSnapshot => {
    const activeDescriptor = state.status === "ready"
      ? state.repositories.find(({ id }) => id === state.activeRepositoryId) ??
        null
      : null;
    return {
      activeDescriptor,
      catalogLabel: catalog.label,
      state,
    };
  };
  const scheduleDeletionPoll = () => {
    cancelDeletionPoll?.();
    cancelDeletionPoll = null;
    if (
      !started ||
      snapshot.state.status !== "ready" ||
      !snapshot.state.issues.some(({ status }) => status === "deleting")
    ) {
      return;
    }
    cancelDeletionPoll = scheduler.schedule(() => {
      cancelDeletionPoll = null;
      void reload().catch(() => undefined);
    }, repositoryDeletionPollDelayMs);
  };
  const publish = (state: RepositoryCatalogState) => {
    operation = state.status === "ready" ? state.operation : "idle";
    snapshot = projectSnapshot(state);
    scheduleDeletionPoll();
    listeners.forEach((listener) => listener());
  };
  const persistActiveRepository = (repositoryId: string | null) => {
    if (repositoryId) activeRepositorySelection.save(repositoryId);
    else activeRepositorySelection.clear();
  };
  const publishCatalog = (
    nextCatalog: WorkspaceRepositoryCatalogData,
    preferredRepositoryId?: string | null,
  ) => {
    const current = snapshot.state;
    const repositories = current.status === "ready"
      ? reuseUnchangedRepositoryDescriptors(
          current.repositories,
          nextCatalog.repositories,
        )
      : nextCatalog.repositories;
    const storedRepositoryId = preferredRepositoryId === undefined
      ? activeRepositorySelection.load()
      : preferredRepositoryId;
    const activeRepositoryId = repositories.some(
      ({ id }) => id === storedRepositoryId,
    )
      ? storedRepositoryId
      : repositories[0]?.id ?? null;

    persistActiveRepository(activeRepositoryId);
    publish({
      activeRepositoryId,
      creatableAdapters: nextCatalog.creatableAdapters,
      issues: nextCatalog.issues,
      operation: current.status === "ready" ? current.operation : "idle",
      repositories,
      status: "ready",
    });
  };
  const reload = async () => {
    const previous = snapshot.state;

    if (previous.status !== "ready") publish({ status: "loading" });
    try {
      publishCatalog(await catalog.listRepositories());
    } catch (error) {
      if (previous.status === "ready") {
        publish({ ...previous });
        throw error;
      }
      publish({ errorMessage: getErrorMessage(error), status: "failed" });
    }
  };
  const beginOperation = (
    nextOperation: Exclude<RepositoryCatalogOperation, "idle">,
  ) => {
    const current = snapshot.state;

    if (current.status !== "ready") {
      throw new Error("Repository catalog is not ready.");
    }
    if (operation !== "idle") {
      throw new Error("Another repository operation is already running.");
    }
    publish({ ...current, operation: nextOperation });
    return current;
  };
  const finishOperation = () => {
    const current = snapshot.state;

    if (current.status === "ready" && current.operation !== "idle") {
      publish({ ...current, operation: "idle" });
    }
  };

  return {
    async createRepository(input) {
      const current = beginOperation("creating");

      try {
        if (!current.creatableAdapters.includes(input.adapter)) {
          throw new Error(`Repository adapter is unavailable: ${input.adapter}`);
        }
        const label = parsePortableName(input.name, "Repository label");
        const descriptor = await provisionRepository(input, label);
        const latest = snapshot.state;
        const ready = latest.status === "ready" ? latest : current;
        const repositories = [
          ...ready.repositories.filter(({ id }) => id !== descriptor.id),
          descriptor,
        ].sort((left, right) => left.id.localeCompare(right.id));

        persistActiveRepository(descriptor.id);
        publish({
          ...ready,
          activeRepositoryId: descriptor.id,
          issues: ready.issues.filter(({ id }) => id !== descriptor.id),
          operation: "idle",
          repositories,
        });
        return descriptor;
      } catch (error) {
        finishOperation();
        throw error;
      }
    },
    async deleteRepository(input) {
      const previous = beginOperation("deleting");

      try {
        const result = await catalog.deleteRepository(input);
        let nextCatalog: WorkspaceRepositoryCatalogData;

        try {
          nextCatalog = await catalog.listRepositories();
        } catch {
          const deletedEntry = previous.repositories.find(
            ({ id }) => id === input.id,
          );
          const deletingIssue = result.status === "deleting" && deletedEntry
            ? {
                adapter: deletedEntry.adapter,
                code: "repository_busy" as const,
                id: deletedEntry.id,
                location: deletedEntry.location,
                message: "WebDAV managed data deletion is still being completed",
                status: "deleting" as const,
              }
            : null;

          nextCatalog = {
            creatableAdapters: previous.creatableAdapters,
            issues: [
              ...previous.issues.filter(({ id }) => id !== input.id),
              ...(deletingIssue ? [deletingIssue] : []),
            ],
            repositories: previous.repositories.filter(
              ({ id }) => id !== input.id,
            ),
          };
        }
        const preferredRepositoryId = previous.activeRepositoryId === input.id
          ? selectRepositoryAfterDeletion(
              previous.repositories,
              nextCatalog.repositories,
              input.id,
            )
          : previous.activeRepositoryId;

        publishCatalog(nextCatalog, preferredRepositoryId);
        finishOperation();
        return result;
      } catch (error) {
        publish({ ...previous, operation: "idle" });
        throw error;
      }
    },
    getSnapshot: () => snapshot,
    reload,
    async renameRepository(input) {
      const previous = beginOperation("renaming");

      try {
        const label = parsePortableName(input.name, "Repository label");

        if (!previous.repositories.some(({ id }) => id === input.id)) {
          throw new Error(`Repository does not exist: ${input.id}`);
        }
        await catalog.renameRepository({ id: input.id, label });
        publishCatalog(
          await catalog.listRepositories(),
          previous.activeRepositoryId,
        );
      } catch (error) {
        publish({ ...previous, operation: "idle" });
        throw error;
      }
    },
    async selectRepository(repositoryId) {
      const current = beginOperation("switching");

      try {
        if (!current.repositories.some(({ id }) => id === repositoryId)) {
          throw new Error(`Repository does not exist: ${repositoryId}`);
        }
        persistActiveRepository(repositoryId);
        publish({
          ...current,
          activeRepositoryId: repositoryId,
          operation: "idle",
        });
      } catch (error) {
        finishOperation();
        throw error;
      }
    },
    start() {
      if (started) return;
      started = true;
      void reload();
    },
    stop() {
      if (!started) return;
      started = false;
      cancelDeletionPoll?.();
      cancelDeletionPoll = null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
