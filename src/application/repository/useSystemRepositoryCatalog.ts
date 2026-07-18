import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SystemRepositoryCatalog,
  SystemRepositoryCatalogData,
  SystemRepositoryPurpose,
} from "../../storage/repository/systemRepository";

export type SystemRepositoryCatalogState =
  | { status: "loading" }
  | { errorMessage: string; status: "failed" }
  | (SystemRepositoryCatalogData & {
      retryingPurpose: SystemRepositoryPurpose | null;
      status: "ready";
    });

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "System repository catalog failed.";
}

export function useSystemRepositoryCatalog(catalog: SystemRepositoryCatalog) {
  const [state, setState] = useState<SystemRepositoryCatalogState>({
    status: "loading",
  });
  const stateRef = useRef(state);
  const publish = useCallback((next: SystemRepositoryCatalogState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const reload = useCallback(async () => {
    const previous = stateRef.current;

    if (previous.status !== "ready") {
      publish({ status: "loading" });
    }
    try {
      const catalogData = await catalog.listRepositories();

      publish({
        ...catalogData,
        retryingPurpose: null,
        status: "ready",
      });
    } catch (error) {
      if (previous.status === "ready") {
        publish({ ...previous, retryingPurpose: null });
        throw error;
      }
      publish({ errorMessage: getErrorMessage(error), status: "failed" });
    }
  }, [catalog, publish]);
  const retryRepository = useCallback(async (
    purpose: SystemRepositoryPurpose,
  ) => {
    const previous = stateRef.current;

    if (previous.status !== "ready") {
      throw new Error("System repository catalog is not ready.");
    }
    if (previous.retryingPurpose !== null) {
      throw new Error("Another system repository retry is already running.");
    }

    publish({ ...previous, retryingPurpose: purpose });
    try {
      await catalog.retryRepository(purpose);
      const catalogData = await catalog.listRepositories();

      publish({
        ...catalogData,
        retryingPurpose: null,
        status: "ready",
      });
    } catch (error) {
      publish({ ...previous, retryingPurpose: null });
      throw error;
    }
  }, [catalog, publish]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { catalogLabel: catalog.label, reload, retryRepository, state };
}

export type SystemRepositoryCatalogApplication = ReturnType<
  typeof useSystemRepositoryCatalog
>;
