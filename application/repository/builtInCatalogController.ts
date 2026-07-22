// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalog,
  BuiltInCatalogData,
  BuiltInId,
} from "./builtInRepository";

export type BuiltInCatalogState =
  | { status: "loading" }
  | { errorMessage: string; status: "failed" }
  | (BuiltInCatalogData & {
      retryingId: BuiltInId | null;
      status: "ready";
    });

export type BuiltInCatalogApplication = {
  catalogLabel: string;
  reload(): Promise<void>;
  retry(id: BuiltInId): Promise<void>;
  state: BuiltInCatalogState;
};

export function createBuiltInCatalogController(catalog: BuiltInCatalog) {
  const listeners = new Set<() => void>();
  let state: BuiltInCatalogState = { status: "loading" };
  let generation = 0;
  const publish = (next: BuiltInCatalogState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const reload = async () => {
    const operationGeneration = ++generation;
    const previous = state;

    if (previous.status !== "ready") publish({ status: "loading" });
    try {
      const catalogData = await catalog.listBuiltIns();

      if (operationGeneration === generation) {
        publish({ ...catalogData, retryingId: null, status: "ready" });
      }
    } catch (error) {
      if (operationGeneration !== generation) return;
      if (previous.status === "ready") {
        publish({ ...previous, retryingId: null });
        throw error;
      }
      publish({
        errorMessage: error instanceof Error
          ? error.message
          : "Built-in data catalog failed.",
        status: "failed",
      });
    }
  };

  return {
    catalogLabel: catalog.label,
    getState: () => state,
    reload,
    async retry(id: BuiltInId) {
      const previous = state;

      if (previous.status !== "ready") {
        throw new Error("Built-in data catalog is not ready.");
      }
      if (previous.retryingId !== null) {
        throw new Error("Another built-in retry is already running.");
      }
      publish({ ...previous, retryingId: id });
      try {
        await catalog.retry(id);
        const catalogData = await catalog.listBuiltIns();

        publish({ ...catalogData, retryingId: null, status: "ready" });
      } catch (error) {
        publish({ ...previous, retryingId: null });
        throw error;
      }
    },
    start() {
      void reload();
    },
    stop() {
      generation += 1;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type BuiltInCatalogController = ReturnType<
  typeof createBuiltInCatalogController
>;
