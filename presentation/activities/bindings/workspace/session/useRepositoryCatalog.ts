import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActiveRepositorySelection } from "../../../../../application/repository/activeRepositorySelection";
import type {
  RepositoryDeletionResult,
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
} from "../../../../../application/repository/workspaceRepositoryCatalog";
import {
  createRepositoryConnectionKey,
  reuseUnchangedRepositoryDescriptors,
  selectRepositoryAfterDeletion,
  type CreateRepositoryRequest,
  type DeleteRepositoryRequest,
  type RenameRepositoryRequest,
  type RepositoryCatalogOperation,
  type RepositoryCatalogState,
} from "../../../../../application/repository/repositoryCatalog";
import { parsePortableName } from "../../../../../core/naming/portableName";
import { createBrowserInitialWorkspaceContent } from "../../../../../infrastructure/browser/browserApplicationServices";

export {
  createRepositoryConnectionKey,
  reuseUnchangedRepositoryDescriptors,
};
export type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogOperation,
  RepositoryCatalogState,
} from "../../../../../application/repository/repositoryCatalog";

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
  const stateRef = useRef(state);
  const operationRef = useRef<RepositoryCatalogOperation>("idle");

  const publish = useCallback((next: RepositoryCatalogState) => {
    stateRef.current = next;
    operationRef.current = next.status === "ready" ? next.operation : "idle";
    setState(next);
  }, []);
  const persistActiveRepository = useCallback((repositoryId: string | null) => {
    if (repositoryId) {
      activeRepositorySelection.save(repositoryId);
    } else {
      activeRepositorySelection.clear();
    }
  }, [activeRepositorySelection]);
  const publishCatalog = useCallback((
    nextCatalog: WorkspaceRepositoryCatalogData,
    preferredRepositoryId?: string | null,
  ) => {
    const current = stateRef.current;
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
  }, [activeRepositorySelection, persistActiveRepository, publish]);
  const reload = useCallback(async () => {
    const previous = stateRef.current;

    if (previous.status !== "ready") {
      publish({ status: "loading" });
    }
    try {
      publishCatalog(await catalog.listRepositories());
    } catch (error) {
      if (previous.status === "ready") {
        // Publish a fresh ready state so a deleting-issue poll schedules its
        // next attempt even when this catalog refresh failed unchanged.
        publish({ ...previous });
        throw error;
      }
      publish({ errorMessage: getErrorMessage(error), status: "failed" });
    }
  }, [catalog, publish, publishCatalog]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (
      state.status !== "ready" ||
      !state.issues.some(({ status }) => status === "deleting")
    ) {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      void reload().catch(() => undefined);
    }, 1_000);

    return () => globalThis.clearTimeout(timer);
  }, [reload, state]);

  const beginOperation = useCallback((operation: Exclude<RepositoryCatalogOperation, "idle">) => {
    const current = stateRef.current;

    if (current.status !== "ready") {
      throw new Error("Repository catalog is not ready.");
    }
    if (operationRef.current !== "idle") {
      throw new Error("Another repository operation is already running.");
    }

    publish({ ...current, operation });
    return current;
  }, [publish]);
  const finishOperation = useCallback(() => {
    const current = stateRef.current;

    if (current.status === "ready" && current.operation !== "idle") {
      publish({ ...current, operation: "idle" });
    }
  }, [publish]);

  const selectRepository = useCallback(async (repositoryId: string) => {
    const current = beginOperation("switching");

    try {
      if (!current.repositories.some(({ id }) => id === repositoryId)) {
        throw new Error(`Repository does not exist: ${repositoryId}`);
      }
      persistActiveRepository(repositoryId);
      publish({ ...current, activeRepositoryId: repositoryId, operation: "idle" });
    } catch (error) {
      finishOperation();
      throw error;
    }
  }, [beginOperation, finishOperation, persistActiveRepository, publish]);

  const createRepository = useCallback(async (input: CreateRepositoryRequest) => {
    const current = beginOperation("creating");

    try {
      if (!current.creatableAdapters.includes(input.adapter)) {
        throw new Error(`Repository adapter is unavailable: ${input.adapter}`);
      }
      const label = parsePortableName(input.name, "Repository label");
      const content = createBrowserInitialWorkspaceContent(label);
      const descriptor = await catalog.createRepository(
        input.adapter === "webdav"
          ? {
              adapter: "webdav",
              authentication: input.authentication,
              initialContent: content,
              label,
              url: input.url.trim(),
            }
          : {
              adapter: input.adapter,
              content,
              label,
            },
      );
      const latest = stateRef.current;
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
  }, [beginOperation, catalog, finishOperation, persistActiveRepository, publish]);

  const deleteRepository = useCallback(async (
    input: DeleteRepositoryRequest,
  ): Promise<RepositoryDeletionResult> => {
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
          repositories: previous.repositories.filter(({ id }) => id !== input.id),
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
  }, [beginOperation, catalog, finishOperation, publish, publishCatalog]);
  const renameRepository = useCallback(async (
    input: RenameRepositoryRequest,
  ) => {
    const previous = beginOperation("renaming");

    try {
      const label = parsePortableName(input.name, "Repository label");
      if (!previous.repositories.some(({ id }) => id === input.id)) {
        throw new Error(`Repository does not exist: ${input.id}`);
      }
      await catalog.renameRepository({
        id: input.id,
        label,
      });
      const nextCatalog = await catalog.listRepositories();

      publishCatalog(nextCatalog, previous.activeRepositoryId);
    } catch (error) {
      publish({ ...previous, operation: "idle" });
      throw error;
    }
  }, [beginOperation, catalog, publish, publishCatalog]);

  const activeDescriptor = state.status === "ready"
    ? state.repositories.find(
        (repository) => repository.id === state.activeRepositoryId,
      ) ?? null
    : null;
  const activeRepositoryConnection = createRepositoryConnectionKey(
    activeDescriptor,
  );
  const repository = useMemo(
    () => activeDescriptor ? catalog.openRepository(activeDescriptor) : null,
    // A label-only catalog mutation must not rebuild the active session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRepositoryConnection, catalog],
  );

  return {
    activeDescriptor,
    catalogLabel: catalog.label,
    createRepository,
    deleteRepository,
    reload,
    renameRepository,
    repository,
    selectRepository,
    state,
  };
}
