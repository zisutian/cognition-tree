import type {
  VisualizationViewModel,
} from "../../../application/workspace/activities/visualization/visualizationViewModel";
import {
  createDefaultReferenceGraphSettings,
} from "../../../presentation/activities/views/visualization/referenceGraphSettings";
import type {
  ReferenceGraphSession,
} from "../../../presentation/activities/views/visualization/useReferenceGraphSession";

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

export function createReferenceGraphSession(
  overrides: Partial<ReferenceGraphSession> = {},
): ReferenceGraphSession {
  return {
    resetSettings: () => undefined,
    resetSignal: 0,
    resetView: () => undefined,
    settings: createDefaultReferenceGraphSettings(),
    updateSettings: () => undefined,
    ...overrides,
  };
}
