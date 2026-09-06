import type {
  SimulationLinkDatum,
  SimulationNodeDatum,
} from "d3-force";
import type { PointerEvent } from "react";
import type {
  VisibleReferenceGraphEdge,
  VisibleReferenceGraphNode,
} from "./referenceGraphView.ts";

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

export type GraphNodePointerMovement = {
  dragStarted: boolean;
  startGraphX: number;
  startGraphY: number;
};

export const defaultCanvasSize = {
  height: 520,
  width: 920,
};

const minScale = 0.35;
const maxScale = 2.8;
export const graphNodeDragThreshold = 4;

export function clampScale(scale: number) {
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function updateGraphNodePointerMovement(
  movement: GraphNodePointerMovement,
  point: { x: number; y: number },
): GraphNodePointerMovement {
  if (
    movement.dragStarted ||
    Math.hypot(
      point.x - movement.startGraphX,
      point.y - movement.startGraphY,
    ) >= graphNodeDragThreshold
  ) {
    return movement.dragStarted
      ? movement
      : { ...movement, dragStarted: true };
  }

  return movement;
}

export function createInitialNode(
  node: VisibleReferenceGraphNode,
  index: number,
  _total: number,
  width: number,
  height: number,
): GraphSimulationNode {
  if (index === 0) {
    return {
      ...node,
      x: width / 2,
      y: height / 2,
    };
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const spacing = Math.max(18, Math.min(34, Math.min(width, height) * 0.045));
  const radius = Math.min(
    spacing * Math.sqrt(index),
    Math.min(width, height) * 0.32,
  );
  const angle = index * goldenAngle;

  return {
    ...node,
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

export function releaseGraphSimulationNode(node: GraphSimulationNode) {
  node.fx = null;
  node.fy = null;
}

export function getNextGraphKeyboardNode(
  nodes: VisibleReferenceGraphNode[],
  currentNodeId: string | null,
  direction: -1 | 1,
) {
  if (nodes.length === 0) {
    return null;
  }

  const currentIndex = currentNodeId
    ? nodes.findIndex((node) => node.id === currentNodeId)
    : -1;
  const nextIndex = currentIndex < 0
    ? direction > 0 ? 0 : nodes.length - 1
    : (currentIndex + direction + nodes.length) % nodes.length;

  return nodes[nextIndex] ?? null;
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
