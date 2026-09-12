// SPDX-License-Identifier: GPL-3.0-or-later

import { parsePortableName } from "../../core/naming/index.ts";
import type { ActiveRepositorySelection } from "./activeRepositorySelection.ts";
import {
  reuseUnchangedRepositoryDescriptors,
  selectRepositoryAfterDeletion,
  type CreateRepositoryRequest,
  type DeleteRepositoryRequest,
  type RenameRepositoryRequest,
  type RepositoryCatalogOperation,
  type RepositoryCatalogState,
} from "./repositoryCatalog.ts";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
  WorkspaceRepositoryDescriptor,
} from "./workspaceRepositoryCatalog.ts";

export type RepositoryCatalogControllerSnapshot = {
  activeDescriptor: WorkspaceRepositoryDescriptor | null;
  catalogLabel: string;
  state: RepositoryCatalogState;
};

export type RepositoryCatalogController = {
  createRepository(
    input: CreateRepositoryRequest,
  ): Promise<WorkspaceRepositoryDescriptor>;
  deleteRepository(input: DeleteRepositoryRequest): Promise<void>;
  dispose(): void;
  getSnapshot(): RepositoryCatalogControllerSnapshot;
  reload(): Promise<void>;
  renameRepository(input: RenameRepositoryRequest): Promise<void>;
  selectRepository(repositoryId: string): Promise<void>;
  start(): void;
  subscribe(listener: () => void): () => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository catalog failed.";
}

export function createRepositoryCatalogController({
  activeRepositorySelection,
  catalog,
  createOperationId,
}: {
  activeRepositorySelection: ActiveRepositorySelection;
  catalog: WorkspaceRepositoryCatalog;
  createOperationId(): string;
}): RepositoryCatalogController {
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let started = false;
  let snapshot: RepositoryCatalogControllerSnapshot = {
    activeDescriptor: null,
    catalogLabel: catalog.label,
    state: { status: "loading" },
  };

  const projectSnapshot = (
    state: RepositoryCatalogState,
  ): RepositoryCatalogControllerSnapshot => {
    const activeDescriptor =
      state.status === "ready"
        ? (state.repositories.find(
            ({ id }) => id === state.activeRepositoryId,
          ) ?? null)
        : null;
    return {
      activeDescriptor,
      catalogLabel: catalog.label,
      state,
    };
  };
  const publish = (state: RepositoryCatalogState) => {
    snapshot = projectSnapshot(state);
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
    const repositories =
      current.status === "ready"
        ? reuseUnchangedRepositoryDescriptors(
            current.repositories,
            nextCatalog.repositories,
          )
        : nextCatalog.repositories;
    const storedRepositoryId =
      preferredRepositoryId === undefined
        ? activeRepositorySelection.load()
        : preferredRepositoryId;
    const activeRepositoryId = repositories.some(
      ({ id }) => id === storedRepositoryId,
    )
      ? storedRepositoryId
      : (repositories[0]?.id ?? null);

    persistActiveRepository(activeRepositoryId);
    publish({
      activeRepositoryId,
      revision: nextCatalog.revision,
      issues: nextCatalog.issues,
      operation: current.status === "ready" ? current.operation : "idle",
      repositories,
      status: "ready",
    });
  };
  const reload = async () => {
    if (
      disposed ||
      (snapshot.state.status === "ready" && snapshot.state.operation !== "idle")
    ) {
      return;
    }
    const operationGeneration = ++generation;
    const previous = snapshot.state;

    if (previous.status !== "ready") publish({ status: "loading" });
    try {
      const catalogData = await catalog.listRepositories();

      if (operationGeneration === generation) {
        // Cached data can seed a view, but cannot roll back facts this
        // controller has already received from the service or a commit.
        publishCatalog(
          catalogData.revision === null && previous.status === "ready"
            ? {
                revision: null,
                issues: previous.issues,
                repositories: previous.repositories,
              }
            : catalogData,
        );
      }
    } catch (error) {
      if (operationGeneration !== generation) return;
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
    if (disposed) {
      throw new Error("Repository catalog controller is disposed.");
    }
    const current = snapshot.state;

    if (current.status !== "ready") {
      throw new Error("Repository catalog is not ready.");
    }
    if (current.operation !== "idle") {
      throw new Error("Another repository operation is already running.");
    }
    const operationGeneration = ++generation;

    publish({ ...current, operation: nextOperation });
    return { operationGeneration, previous: current };
  };
  const mutationBasis = (
    state: Extract<RepositoryCatalogState, { status: "ready" }>,
  ) => {
    if (!state.revision) throw new Error("请刷新仓库目录后再修改。");
    return { baseRevision: state.revision, operationId: createOperationId() };
  };
  const selectedRepository = (
    state: Extract<RepositoryCatalogState, { status: "ready" }>,
    id: string,
  ) => {
    const descriptor = state.repositories.find((item) => item.id === id);
    if (!descriptor) throw new Error(`Repository does not exist: ${id}`);
    return descriptor.label;
  };
  const finishOperation = (operationGeneration: number) => {
    if (disposed || generation !== operationGeneration) return;
    const current = snapshot.state;

    if (current.status === "ready" && current.operation !== "idle") {
      publish({ ...current, operation: "idle" });
    }
  };

  return {
    async createRepository(input) {
      const { operationGeneration, previous } = beginOperation("creating");

      try {
        const label = parsePortableName(input.name, "Repository label");
        const { descriptor, revision } = await catalog.createRepository({
          label,
          ...mutationBasis(previous),
        });

        if (disposed || generation !== operationGeneration) return descriptor;
        const latest = snapshot.state;
        const ready = latest.status === "ready" ? latest : previous;
        const repositories = [
          ...ready.repositories.filter(({ id }) => id !== descriptor.id),
          descriptor,
        ].sort((left, right) => left.id.localeCompare(right.id));

        persistActiveRepository(descriptor.id);
        publish({
          ...ready,
          activeRepositoryId: descriptor.id,
          revision,
          issues: ready.issues.filter(({ id }) => id !== descriptor.id),
          operation: "idle",
          repositories,
        });
        return descriptor;
      } catch (error) {
        finishOperation(operationGeneration);
        throw error;
      }
    },
    async deleteRepository(input) {
      const { operationGeneration, previous } = beginOperation("deleting");

      try {
        const { revision } = await catalog.deleteRepository({
          ...input,
          repository: selectedRepository(previous, input.id),
          ...mutationBasis(previous),
        });
        if (disposed || generation !== operationGeneration) return;
        let nextCatalog: WorkspaceRepositoryCatalogData;
        const committedCatalog = {
          revision,
          issues: previous.issues.filter(({ id }) => id !== input.id),
          repositories: previous.repositories.filter(
            ({ id }) => id !== input.id,
          ),
        };

        try {
          const refreshed = await catalog.listRepositories();
          nextCatalog =
            refreshed.revision === null
              ? { ...committedCatalog, revision: null }
              : refreshed;
        } catch {
          nextCatalog = committedCatalog;
        }
        if (disposed || generation !== operationGeneration) return;
        const preferredRepositoryId =
          previous.activeRepositoryId === input.id
            ? selectRepositoryAfterDeletion(
                previous.repositories,
                nextCatalog.repositories,
                input.id,
              )
            : previous.activeRepositoryId;

        publishCatalog(nextCatalog, preferredRepositoryId);
        finishOperation(operationGeneration);
      } catch (error) {
        if (!disposed && generation === operationGeneration) {
          publish({ ...previous, operation: "idle" });
        }
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    reload,
    async renameRepository(input) {
      const { operationGeneration, previous } = beginOperation("renaming");

      try {
        const label = parsePortableName(input.name, "Repository label");

        if (!previous.repositories.some(({ id }) => id === input.id)) {
          throw new Error(`Repository does not exist: ${input.id}`);
        }
        const { descriptor, revision } = await catalog.renameRepository({
          id: input.id,
          label,
          repository: selectedRepository(previous, input.id),
          ...mutationBasis(previous),
        });
        if (disposed || generation !== operationGeneration) return;
        const nextCatalog = {
          revision,
          issues: previous.issues,
          repositories: previous.repositories.map((item) =>
            item.id === descriptor.id ? descriptor : item,
          ),
        };

        if (disposed || generation !== operationGeneration) return;
        publishCatalog(nextCatalog, previous.activeRepositoryId);
        finishOperation(operationGeneration);
      } catch (error) {
        if (!disposed && generation === operationGeneration) {
          publish({ ...previous, operation: "idle" });
        }
        throw error;
      }
    },
    async selectRepository(repositoryId) {
      const { operationGeneration, previous } = beginOperation("switching");

      try {
        if (!previous.repositories.some(({ id }) => id === repositoryId)) {
          throw new Error(`Repository does not exist: ${repositoryId}`);
        }
        persistActiveRepository(repositoryId);
        publish({
          ...previous,
          activeRepositoryId: repositoryId,
          operation: "idle",
        });
      } catch (error) {
        finishOperation(operationGeneration);
        throw error;
      }
    },
    start() {
      if (disposed || started) return;
      started = true;
      void reload().catch(() => undefined);
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
