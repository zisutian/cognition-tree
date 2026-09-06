import type { UiVisualizationView } from "../../projection/viewGraph.ts";
import type { UiNoteId } from "../../projection/viewTree.ts";

export type ReferenceGraphMode = "global" | "local";
export type ReferenceGraphLocalDepth = 1 | 2;

export type VisualizationFilter = {
  hideIsolated: boolean;
  localDepth: ReferenceGraphLocalDepth;
  mode: ReferenceGraphMode;
  query: string;
};

export type VisualizationFilterController = {
  filter: VisualizationFilter;
  setHideIsolated: (hideIsolated: boolean) => void;
  setLocalDepth: (depth: ReferenceGraphLocalDepth) => void;
  setMode: (mode: ReferenceGraphMode) => void;
  setQuery: (query: string) => void;
};

export type VisualizationViewModel = UiVisualizationView &
  VisualizationFilterController & {
    onSelectNote: (noteId: UiNoteId) => void;
  };
