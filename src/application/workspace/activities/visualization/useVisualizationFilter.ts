import { useMemo, useState } from "react";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
  VisualizationFilterController,
} from "./visualizationViewModel";

export function useVisualizationFilter(): VisualizationFilterController {
  const [mode, setMode] = useState<ReferenceGraphMode>("global");
  const [localDepth, setLocalDepth] = useState<ReferenceGraphLocalDepth>(1);
  const [query, setQuery] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);

  return useMemo(
    () => ({
      filter: { hideIsolated, localDepth, mode, query },
      setHideIsolated,
      setLocalDepth,
      setMode,
      setQuery,
    }),
    [hideIsolated, localDepth, mode, query],
  );
}
