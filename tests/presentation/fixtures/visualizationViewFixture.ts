import type {
  VisualizationViewModel,
} from "../../../application/workspace/notes/graph/visualizationViewModel";
import {
  createDefaultReferenceGraphSettings,
} from "../../../presentation/activities/notes/graph/referenceGraphSettings";
import type {
  ReferenceGraphSession,
} from "../../../presentation/activities/notes/graph/useReferenceGraphSession";
import {
  ReferenceGraphControllerCache,
} from "../../../presentation/activities/notes/graph/referenceGraphController";

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
  const controllers = new ReferenceGraphControllerCache();

  return {
    getController: (topologyRevision) => controllers.get(topologyRevision),
    resetSettings: () => undefined,
    resetSignal: 0,
    resetView: () => undefined,
    settings: createDefaultReferenceGraphSettings(),
    updateSettings: () => undefined,
    ...overrides,
  };
}
