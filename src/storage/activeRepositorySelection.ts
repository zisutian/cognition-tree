const activeRepositoryStorageKey = "cognition-tree.active-repository";

function getStorage() {
  return globalThis.localStorage ?? null;
}

export function loadActiveRepositoryId() {
  try {
    return getStorage()?.getItem(activeRepositoryStorageKey) ?? null;
  } catch {
    return null;
  }
}

export function saveActiveRepositoryId(repositoryId: string) {
  try {
    getStorage()?.setItem(activeRepositoryStorageKey, repositoryId);
  } catch {
    // Repository selection can remain in memory when storage is unavailable.
  }
}
