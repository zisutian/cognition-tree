import type {
  UiReferenceGraphEdge,
  UiReferenceGraphNode,
  UiReferenceGraphView,
} from "../../../../application/workspace/projection/viewGraph";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
} from "../../../../application/workspace/activities/visualization/visualizationViewModel";

export type VisibleReferenceGraphNode = UiReferenceGraphNode & {
  radius: number;
};

export type VisibleReferenceGraphEdge = UiReferenceGraphEdge;

export type VisibleReferenceGraph = {
  edges: VisibleReferenceGraphEdge[];
  nodes: VisibleReferenceGraphNode[];
};

export type ReferenceGraphFilterState = {
  activeNoteId: string | null;
  hideIsolated: boolean;
  localDepth: ReferenceGraphLocalDepth;
  mode: ReferenceGraphMode;
  query: string;
};

export type PositionedReferenceGraphNode = VisibleReferenceGraphNode & {
  x: number;
  y: number;
};

export function getReferenceGraphNodeRadius(
  node: Pick<UiReferenceGraphNode, "referencesIn" | "referencesOut">,
) {
  return Math.min(
    14,
    4 + Math.sqrt(node.referencesIn + node.referencesOut) * 2.4,
  );
}

function normalizeGraphQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

function collectLocalNoteIds({
  activeNoteId,
  adjacencyByNoteId,
  depth,
}: {
  activeNoteId: string;
  adjacencyByNoteId: UiReferenceGraphView["adjacencyByNoteId"];
  depth: ReferenceGraphLocalDepth;
}) {
  const selectedNoteIds = new Set([activeNoteId]);
  let frontier = new Set([activeNoteId]);

  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const nextFrontier = new Set<string>();

    for (const noteId of frontier) {
      for (const neighborId of adjacencyByNoteId.get(noteId) ?? []) {
        if (!selectedNoteIds.has(neighborId)) {
          selectedNoteIds.add(neighborId);
          nextFrontier.add(neighborId);
        }
      }
    }

    frontier = nextFrontier;
  }

  return selectedNoteIds;
}

export function createVisibleReferenceGraph(
  graph: UiReferenceGraphView,
  state: ReferenceGraphFilterState,
): VisibleReferenceGraph {
  const query = normalizeGraphQuery(state.query);
  const localNoteIds =
    state.mode === "local" && state.activeNoteId
      ? collectLocalNoteIds({
          activeNoteId: state.activeNoteId,
          adjacencyByNoteId: graph.adjacencyByNoteId,
          depth: state.localDepth,
        })
      : null;
  const nodes = graph.nodes
    .filter((node) => (localNoteIds ? localNoteIds.has(node.id) : true))
    .filter((node) =>
      state.hideIsolated && node.id !== state.activeNoteId ? !node.isolated : true,
    )
    .filter((node) =>
      query ? node.title.toLocaleLowerCase().includes(query) : true,
    )
    .map((node) => ({
      ...node,
      radius: getReferenceGraphNodeRadius(node),
    }));
  const visibleNoteIds = new Set(nodes.map((node) => node.id));
  const edges: UiReferenceGraphEdge[] = [];

  for (const node of nodes) {
    for (
      const edge of
      graph.detailsByNoteId.get(node.id)?.outgoingEdges ?? []
    ) {
      if (visibleNoteIds.has(edge.targetNoteId)) {
        edges.push(edge);
      }
    }
  }

  return {
    edges,
    nodes,
  };
}

export function findReferenceGraphNodeAtPoint({
  nodes,
  x,
  y,
}: {
  nodes: PositionedReferenceGraphNode[];
  x: number;
  y: number;
}) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    const distance = Math.hypot(node.x - x, node.y - y);

    if (distance <= node.radius + 4) {
      return node;
    }
  }

  return null;
}
