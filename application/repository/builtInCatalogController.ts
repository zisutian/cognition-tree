// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalog,
  BuiltInCatalogData,
  BuiltInId,
} from "./builtInCatalog.ts";

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
  let disposed = false;
  let state: BuiltInCatalogState = { status: "loading" };
  let generation = 0;
  let started = false;
  const publish = (next: BuiltInCatalogState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const reload = async () => {
    if (disposed || state.status === "ready" && state.retryingId !== null) {
      return;
    }
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
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      listeners.clear();
    },
    getState: () => state,
    reload,
    async retry(id: BuiltInId) {
      if (disposed) {
        throw new Error("Built-in data catalog controller is disposed.");
      }
      const previous = state;

      if (previous.status !== "ready") {
        throw new Error("Built-in data catalog is not ready.");
      }
      if (previous.retryingId !== null) {
        throw new Error("Another built-in retry is already running.");
      }
      const operationGeneration = ++generation;

      publish({ ...previous, retryingId: id });
      try {
        await catalog.retry(id);
        const catalogData = await catalog.listBuiltIns();

        if (operationGeneration === generation) {
          publish({ ...catalogData, retryingId: null, status: "ready" });
        }
      } catch (error) {
        if (operationGeneration === generation) {
          publish({ ...previous, retryingId: null });
        }
        throw error;
      }
    },
    start() {
      if (disposed || started) return;
      started = true;
      void reload().catch(() => undefined);
    },
    subscribe(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type BuiltInCatalogController = ReturnType<
  typeof createBuiltInCatalogController
>;
