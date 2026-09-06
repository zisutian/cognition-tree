import { useMemo } from "react";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
  VisualizationFilterController,
} from "../../../../application/workspace/index.ts";
import {
  useRepositorySessionState,
  createRepositorySessionKey,
} from "../../../ui/index.ts";


type VisualizationFilterState = VisualizationFilterController["filter"];

const visualizationFilterSessionKey =
  createRepositorySessionKey<VisualizationFilterState>(
    "notes-visualization-filter",
  );

function createVisualizationFilterState(): VisualizationFilterState {
  return {
    hideIsolated: false,
    localDepth: 1,
    mode: "global",
    query: "",
  };
}

export function useVisualizationFilter(
  repositoryId: string,
): VisualizationFilterController {
  const [filter, setFilter] = useRepositorySessionState(
    visualizationFilterSessionKey,
    repositoryId,
    createVisualizationFilterState,
  );

  return useMemo(
    () => ({
      filter,
      setHideIsolated: (hideIsolated: boolean) =>
        setFilter((current) => ({ ...current, hideIsolated })),
      setLocalDepth: (localDepth: ReferenceGraphLocalDepth) =>
        setFilter((current) => ({ ...current, localDepth })),
      setMode: (mode: ReferenceGraphMode) =>
        setFilter((current) => ({ ...current, mode })),
      setQuery: (query: string) =>
        setFilter((current) => ({ ...current, query })),
    }),
    [filter, setFilter],
  );
}
