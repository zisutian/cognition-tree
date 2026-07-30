import {
  appProblemsDefaultHeight,
  clampAppContextWidth,
  clampAppProblemsHeight,
} from "./frameResize";

const contextWidths = new Map<string, number>();
const problemsLayouts = new Map<string, RepositoryProblemsLayout>();

export type RepositoryProblemsLayout = {
  expanded: boolean;
  height: number;
};

export const defaultRepositoryProblemsLayout: RepositoryProblemsLayout = {
  expanded: false,
  height: appProblemsDefaultHeight,
};

export function readRepositoryContextWidth(repositoryId: string) {
  return contextWidths.get(repositoryId) ?? null;
}

export function writeRepositoryContextWidth(
  repositoryId: string,
  width: number,
) {
  contextWidths.set(repositoryId, clampAppContextWidth(width));
}

export function readRepositoryProblemsLayout(
  repositoryId: string,
): RepositoryProblemsLayout {
  return {
    ...(problemsLayouts.get(repositoryId) ?? defaultRepositoryProblemsLayout),
  };
}

export function writeRepositoryProblemsLayout(
  repositoryId: string,
  layout: RepositoryProblemsLayout,
) {
  problemsLayouts.set(repositoryId, {
    expanded: layout.expanded,
    height: clampAppProblemsHeight(layout.height),
  });
}
