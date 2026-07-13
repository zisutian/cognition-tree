import { useMemo, useState } from "react";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
  VisualizationViewModel,
} from "./activityViewModels";

export function useVisualizationViewModel(
  visualization: Pick<
    VisualizationViewModel,
    "activeNoteId" | "graph" | "onSelectNote"
  >,
): VisualizationViewModel {
  const [mode, setMode] = useState<ReferenceGraphMode>("global");
  const [localDepth, setLocalDepth] = useState<ReferenceGraphLocalDepth>(1);
  const [query, setQuery] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);

  return useMemo(
    () => ({
      ...visualization,
      filter: {
        hideIsolated,
        localDepth,
        mode,
        query,
      },
      setHideIsolated,
      setLocalDepth,
      setMode,
      setQuery,
    }),
    [hideIsolated, localDepth, mode, query, visualization],
  );
}
