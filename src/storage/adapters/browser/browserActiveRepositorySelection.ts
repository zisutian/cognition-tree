import type { ActiveRepositorySelection } from "../../repository/activeRepositorySelection";

const activeRepositoryStorageKey = "cognition-tree.active-repository";

function getStorage() {
  return globalThis.localStorage ?? null;
}

export function createBrowserActiveRepositorySelection(): ActiveRepositorySelection {
  return {
    load() {
      try {
        return getStorage()?.getItem(activeRepositoryStorageKey) ?? null;
      } catch {
        return null;
      }
    },
    save(repositoryId) {
      try {
        getStorage()?.setItem(activeRepositoryStorageKey, repositoryId);
      } catch {
        // Repository selection can remain in memory when storage is unavailable.
      }
    },
  };
}
