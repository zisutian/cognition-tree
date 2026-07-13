import type { NoteReferenceGraph } from "../../../workspace/queries/workspaceQueries";
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

export type UiReferenceGraphUnresolvedReference = {
  count: number;
  sourceNoteId: UiNoteId;
  sourceTitle: string;
  targetText: string;
};

export type UiReferenceGraphRankedNode = UiReferenceGraphNode & {
  totalReferences: number;
};

export type UiReferenceGraphView = {
  edges: UiReferenceGraphEdge[];
  mostReferencedNodes: UiReferenceGraphRankedNode[];
  nodes: UiReferenceGraphNode[];
  stats: {
    edgeCount: number;
    isolatedCount: number;
    nodeCount: number;
  };
  unresolvedReferences: UiReferenceGraphUnresolvedReference[];
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
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const mostReferencedNodes = nodes
    .map((node) => ({
      ...node,
      totalReferences: node.referencesIn + node.referencesOut,
    }))
    .filter((node) => node.totalReferences > 0)
    .sort((left, right) => right.totalReferences - left.totalReferences)
    .slice(0, 8);

  return {
    edges: graph.edges.map((edge) => ({
      count: edge.count,
      id: edge.id,
      sourceNoteId: edge.sourceNoteId,
      targetNoteId: edge.targetNoteId,
      targetTitle: edge.targetTitle,
    })),
    mostReferencedNodes,
    nodes,
    stats: {
      edgeCount: graph.edges.length,
      isolatedCount: nodes.filter((node) => node.isolated).length,
      nodeCount: nodes.length,
    },
    unresolvedReferences: graph.unresolvedReferences.map((reference) => ({
      count: reference.count,
      sourceNoteId: reference.sourceNoteId,
      sourceTitle:
        nodesById.get(reference.sourceNoteId)?.title ?? reference.sourceNoteId,
      targetText: reference.targetText,
    })),
  };
}
