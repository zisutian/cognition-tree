import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveRepositorySelection } from "../../../storage/repository/activeRepositorySelection";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../../../storage/repository/workspaceRepositoryCatalog";
import { createInitialRepositoryContent } from "./initialRepository";

type RepositoryCatalogState =
  | { status: "loading" }
  | { errorMessage: string; status: "failed" }
  | {
      activeRepositoryId: string | null;
      repositories: WorkspaceRepositoryDescriptor[];
      status: "ready";
    };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository catalog failed.";
}

export function useRepositoryCatalog(
  catalog: WorkspaceRepositoryCatalog,
  activeRepositorySelection: ActiveRepositorySelection,
) {
  const [state, setState] = useState<RepositoryCatalogState>({
    status: "loading",
  });

  const reload = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const repositories = await catalog.listRepositories();
      const storedRepositoryId = activeRepositorySelection.load();
      const activeRepositoryId = repositories.some(
        (repository) => repository.id === storedRepositoryId,
      )
        ? storedRepositoryId
        : repositories[0]?.id ?? null;

      if (activeRepositoryId) {
        activeRepositorySelection.save(activeRepositoryId);
      }

      setState({ activeRepositoryId, repositories, status: "ready" });
    } catch (error) {
      setState({ errorMessage: getErrorMessage(error), status: "failed" });
    }
  }, [activeRepositorySelection, catalog]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectRepository = useCallback((repositoryId: string) => {
    if (
      state.status !== "ready" ||
      !state.repositories.some(
        (repository) => repository.id === repositoryId,
      )
    ) {
      throw new Error(`Repository does not exist: ${repositoryId}`);
    }

    activeRepositorySelection.save(repositoryId);
    setState({ ...state, activeRepositoryId: repositoryId });
  }, [activeRepositorySelection, state]);

  const createRepository = useCallback(async ({
    id,
    name,
  }: {
    id: string;
    name: string;
  }) => {
    const descriptor = await catalog.createRepository({
      content: createInitialRepositoryContent({
        name,
        repositoryId: id,
      }),
      id,
    });

    activeRepositorySelection.save(descriptor.id);
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        ...current,
        activeRepositoryId: descriptor.id,
        repositories: [...current.repositories, descriptor].sort(
          (left, right) => left.id.localeCompare(right.id),
        ),
      };
    });
    return descriptor;
  }, [activeRepositorySelection, catalog]);

  const activeDescriptor = state.status === "ready"
    ? state.repositories.find(
        (repository) => repository.id === state.activeRepositoryId,
      ) ?? null
    : null;
  const repository = useMemo(
    () => activeDescriptor ? catalog.openRepository(activeDescriptor) : null,
    [activeDescriptor, catalog],
  );

  return {
    activeDescriptor,
    catalogLabel: catalog.label,
    createRepository,
    reload,
    repository,
    selectRepository,
    state,
  };
}
