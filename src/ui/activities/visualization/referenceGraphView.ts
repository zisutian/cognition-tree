import type {
  UiReferenceGraphEdge,
  UiReferenceGraphNode,
  UiReferenceGraphView,
} from "../../../application/workspace/projection/viewGraph";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
} from "../../../application/workspace/view-model/activityViewModels";

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
  depth,
  edges,
}: {
  activeNoteId: string;
  depth: ReferenceGraphLocalDepth;
  edges: UiReferenceGraphEdge[];
}) {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    const sourceNeighbors = adjacency.get(edge.sourceNoteId) ?? new Set<string>();
    const targetNeighbors = adjacency.get(edge.targetNoteId) ?? new Set<string>();

    sourceNeighbors.add(edge.targetNoteId);
    targetNeighbors.add(edge.sourceNoteId);
    adjacency.set(edge.sourceNoteId, sourceNeighbors);
    adjacency.set(edge.targetNoteId, targetNeighbors);
  }

  const selectedNoteIds = new Set([activeNoteId]);
  let frontier = new Set([activeNoteId]);

  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const nextFrontier = new Set<string>();

    for (const noteId of frontier) {
      for (const neighborId of adjacency.get(noteId) ?? []) {
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
          depth: state.localDepth,
          edges: graph.edges,
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

  return {
    edges: graph.edges.filter(
      (edge) =>
        visibleNoteIds.has(edge.sourceNoteId) &&
        visibleNoteIds.has(edge.targetNoteId),
    ),
    nodes,
  };
}

export function createDrawableReferenceGraphEdges(
  edges: VisibleReferenceGraphEdge[],
) {
  return edges.filter((edge) => edge.sourceNoteId !== edge.targetNoteId);
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
