import { useMemo } from "react";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
  VisualizationFilterController,
} from "../../../../application/workspace/notes/graph/visualizationViewModel";
import {
  useRepositorySessionState,
} from "../../../ui/workbench/useRepositorySessionState";

type VisualizationFilterState = VisualizationFilterController["filter"];

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
