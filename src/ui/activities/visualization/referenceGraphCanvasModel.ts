import type {
  SimulationLinkDatum,
  SimulationNodeDatum,
} from "d3-force";
import type { PointerEvent } from "react";
import type {
  VisibleReferenceGraphEdge,
  VisibleReferenceGraphNode,
} from "./referenceGraphView";

export type GraphSimulationNode = VisibleReferenceGraphNode &
  SimulationNodeDatum & {
    x: number;
    y: number;
  };

export type GraphSimulationLink = SimulationLinkDatum<GraphSimulationNode> &
  VisibleReferenceGraphEdge;

export type GraphTransform = {
  scale: number;
  x: number;
  y: number;
};

export const defaultCanvasSize = {
  height: 520,
  width: 920,
};

const minScale = 0.35;
const maxScale = 2.8;

export function clampScale(scale: number) {
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function createInitialNode(
  node: VisibleReferenceGraphNode,
  index: number,
  total: number,
  width: number,
  height: number,
): GraphSimulationNode {
  if (total <= 1) {
    return {
      ...node,
      x: width / 2,
      y: height / 2,
    };
  }

  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = Math.min(width, height) * 0.28;

  return {
    ...node,
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

export function createReferenceGraphSimulationKey({
  edges,
  nodes,
}: {
  edges: VisibleReferenceGraphEdge[];
  nodes: VisibleReferenceGraphNode[];
}) {
  return JSON.stringify({
    edges: edges.map((edge) => [
      edge.id,
      edge.sourceNoteId,
      edge.targetNoteId,
      edge.targetTitle,
      edge.count,
    ]),
    nodes: nodes.map((node) => [
      node.id,
      node.title,
      node.isolated,
      node.referencesIn,
      node.referencesOut,
      node.radius,
    ]),
  });
}

export function resolveLinkedNodeId(
  node: string | number | GraphSimulationNode | undefined,
) {
  return typeof node === "object" && node ? node.id : String(node ?? "");
}

export function toGraphPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  transform: GraphTransform,
) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  return {
    x: (canvasX - transform.x) / transform.scale,
    y: (canvasY - transform.y) / transform.scale,
  };
}
