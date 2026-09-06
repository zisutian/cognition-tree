// SPDX-License-Identifier: GPL-3.0-or-later

import type { ActiveRepositorySelection } from "../../../application/repository/index.ts";

const activeRepositoryStorageKey = "cognition-tree.active-repository";

function getStorage() {
  return globalThis.localStorage ?? null;
}

export function createClientActiveRepositorySelection(): ActiveRepositorySelection {
  return {
    clear() {
      try {
        getStorage()?.removeItem(activeRepositoryStorageKey);
      } catch {
        // Repository selection can remain in memory when storage is unavailable.
      }
    },
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
