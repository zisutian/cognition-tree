import { clampAppContextWidth } from "./frameResize";

const contextWidthStoragePrefix = "cognition-tree.context-width";

function createContextWidthStorageKey(repositoryId: string) {
  return `${contextWidthStoragePrefix}.${repositoryId}`;
}

export function loadRepositoryContextWidth(repositoryId: string) {
  try {
    const source = globalThis.localStorage?.getItem(
      createContextWidthStorageKey(repositoryId),
    );

    if (source === null || source === undefined || source.trim() === "") {
      return null;
    }

    const width = Number(source);
    return Number.isFinite(width) ? clampAppContextWidth(width) : null;
  } catch {
    return null;
  }
}

export function saveRepositoryContextWidth(
  repositoryId: string,
  width: number,
) {
  try {
    globalThis.localStorage?.setItem(
      createContextWidthStorageKey(repositoryId),
      String(clampAppContextWidth(width)),
    );
  } catch {
    // Layout remains usable in memory when browser storage is unavailable.
  }
}
