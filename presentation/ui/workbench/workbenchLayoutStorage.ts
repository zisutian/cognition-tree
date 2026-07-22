import {
  appProblemsDefaultHeight,
  clampAppContextWidth,
  clampAppProblemsHeight,
} from "./frameResize";

const contextWidthStoragePrefix = "cognition-tree.context-width";
const problemsLayoutStoragePrefix = "cognition-tree.problems-layout";
const problemsLayoutVersion = 1;

export type RepositoryProblemsLayout = {
  expanded: boolean;
  height: number;
};

export const defaultRepositoryProblemsLayout: RepositoryProblemsLayout = {
  expanded: false,
  height: appProblemsDefaultHeight,
};

function createContextWidthStorageKey(repositoryId: string) {
  return `${contextWidthStoragePrefix}.${repositoryId}`;
}

function createProblemsLayoutStorageKey(repositoryId: string) {
  return `${problemsLayoutStoragePrefix}.${repositoryId}`;
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

export function loadRepositoryProblemsLayout(
  repositoryId: string,
): RepositoryProblemsLayout {
  try {
    const source = globalThis.localStorage?.getItem(
      createProblemsLayoutStorageKey(repositoryId),
    );

    if (!source) {
      return { ...defaultRepositoryProblemsLayout };
    }

    const value = JSON.parse(source) as {
      expanded?: unknown;
      height?: unknown;
      version?: unknown;
    };

    if (
      value.version !== problemsLayoutVersion ||
      typeof value.expanded !== "boolean" ||
      typeof value.height !== "number" ||
      !Number.isFinite(value.height)
    ) {
      return { ...defaultRepositoryProblemsLayout };
    }

    return {
      expanded: value.expanded,
      height: clampAppProblemsHeight(value.height),
    };
  } catch {
    return { ...defaultRepositoryProblemsLayout };
  }
}

export function saveRepositoryProblemsLayout(
  repositoryId: string,
  layout: RepositoryProblemsLayout,
) {
  try {
    globalThis.localStorage?.setItem(
      createProblemsLayoutStorageKey(repositoryId),
      JSON.stringify({
        expanded: layout.expanded,
        height: clampAppProblemsHeight(layout.height),
        version: problemsLayoutVersion,
      }),
    );
  } catch {
    // Layout remains usable in memory when browser storage is unavailable.
  }
}
