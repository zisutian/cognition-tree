import type { NoteReferenceGraph } from "../../../core/workspace/indexes/workspaceParseIndex";
import type { UiNoteId } from "./viewTree";

export type UiReferenceGraphNode = {
  id: UiNoteId;
  isolated: boolean;
  referencesIn: number;
  referencesOut: number;
  title: string;
};

export type UiReferenceGraphEdge = {
  count: number;
  id: string;
  sourceNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  targetTitle: string;
};

export type UiReferenceGraphRankedNode = UiReferenceGraphNode & {
  totalReferences: number;
};

export type UiReferenceGraphNodeDetails = {
  incomingEdges: readonly UiReferenceGraphEdge[];
  outgoingEdges: readonly UiReferenceGraphEdge[];
};

export type UiReferenceGraphView = {
  adjacencyByNoteId: ReadonlyMap<UiNoteId, ReadonlySet<UiNoteId>>;
  detailsByNoteId: ReadonlyMap<UiNoteId, UiReferenceGraphNodeDetails>;
  edges: UiReferenceGraphEdge[];
  mostReferencedNodes: UiReferenceGraphRankedNode[];
  nodes: UiReferenceGraphNode[];
  stats: {
    edgeCount: number;
    isolatedCount: number;
    nodeCount: number;
  };
  topologyIdentity: object;
};

export type UiVisualizationView = {
  activeNoteId: UiNoteId | null;
  graph: UiReferenceGraphView;
};

export function createUiReferenceGraphView(
  graph: NoteReferenceGraph,
): UiReferenceGraphView {
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    isolated: node.isolated,
    referencesIn: node.referencesIn,
    referencesOut: node.referencesOut,
    title: node.title,
  }));
  const edges = graph.edges.map((edge) => ({
    count: edge.count,
    id: edge.id,
    sourceNoteId: edge.sourceNoteId,
    targetNoteId: edge.targetNoteId,
    targetTitle: edge.targetTitle,
  }));
  const adjacencyByNoteId = new Map<UiNoteId, Set<UiNoteId>>(
    nodes.map((node) => [node.id, new Set<UiNoteId>()]),
  );
  const mutableDetailsByNoteId = new Map<UiNoteId, {
    incomingEdges: UiReferenceGraphEdge[];
    outgoingEdges: UiReferenceGraphEdge[];
  }>(nodes.map((node) => [node.id, {
    incomingEdges: [],
    outgoingEdges: [],
  }]));

  for (const edge of edges) {
    adjacencyByNoteId.get(edge.sourceNoteId)?.add(edge.targetNoteId);
    adjacencyByNoteId.get(edge.targetNoteId)?.add(edge.sourceNoteId);
    mutableDetailsByNoteId.get(edge.sourceNoteId)?.outgoingEdges.push(edge);
    mutableDetailsByNoteId.get(edge.targetNoteId)?.incomingEdges.push(edge);
  }

  const mostReferencedNodes = nodes
    .map((node) => ({
      ...node,
      totalReferences: node.referencesIn + node.referencesOut,
    }))
    .filter((node) => node.totalReferences > 0)
    .sort((left, right) =>
      right.totalReferences - left.totalReferences ||
      left.title.localeCompare(right.title, "zh-CN") ||
      left.id.localeCompare(right.id, "zh-CN")
    )
    .slice(0, 8);

  return {
    adjacencyByNoteId,
    detailsByNoteId: mutableDetailsByNoteId,
    edges,
    mostReferencedNodes,
    nodes,
    stats: {
      edgeCount: graph.edges.length,
      isolatedCount: nodes.filter((node) => node.isolated).length,
      nodeCount: nodes.length,
    },
    topologyIdentity: graph,
  };
}
