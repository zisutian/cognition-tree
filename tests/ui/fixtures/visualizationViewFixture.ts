import type {
  VisualizationViewModel,
} from "../../../application/workspace/activities/visualization/visualizationViewModel";

export function createVisualizationView(
  overrides: Partial<VisualizationViewModel> = {},
): VisualizationViewModel {
  return {
    activeNoteId: "note-source",
    filter: {
      hideIsolated: false,
      localDepth: 1,
      mode: "global",
      query: "",
    },
    graph: {
      adjacencyByNoteId: new Map(),
      detailsByNoteId: new Map(),
      edges: [],
      mostReferencedNodes: [],
      nodes: [],
      revision: 0,
      stats: {
        edgeCount: 0,
        isolatedCount: 0,
        nodeCount: 0,
      },
    },
    onSelectNote: () => undefined,
    setHideIsolated: () => undefined,
    setLocalDepth: () => undefined,
    setMode: () => undefined,
    setQuery: () => undefined,
    ...overrides,
  };
}
