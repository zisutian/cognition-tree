import { createInitialNode, type GraphSimulationNode, type GraphTransform } from "./referenceGraphCanvasModel";
import type { VisibleReferenceGraphNode } from "./referenceGraphView";

const maximumCachedGraphControllers = 12;
const graphControllers = new Map<string, ReferenceGraphController>();

export function consumeReferenceGraphResetSignal(
  previousSignal: { current: number },
  nextSignal: number,
) {
  if (previousSignal.current === nextSignal) {
    return false;
  }

  previousSignal.current = nextSignal;
  return true;
}

export class ReferenceGraphController {
  readonly positions = new Map<string, { x: number; y: number }>();
  transform: GraphTransform = { scale: 1, x: 0, y: 0 };

  createNodes(
    nodes: VisibleReferenceGraphNode[],
    width: number,
    height: number,
  ): GraphSimulationNode[] {
    return nodes.map((node, index) => {
      const storedPosition = this.positions.get(node.id);

      return storedPosition
        ? { ...node, ...storedPosition }
        : createInitialNode(node, index, nodes.length, width, height);
    });
  }

  capturePositions(nodes: GraphSimulationNode[]) {
    const visibleNodeIds = new Set(nodes.map((node) => node.id));

    for (const nodeId of this.positions.keys()) {
      if (!visibleNodeIds.has(nodeId)) {
        this.positions.delete(nodeId);
      }
    }

    for (const node of nodes) {
      this.positions.set(node.id, { x: node.x, y: node.y });
    }
  }

  resetTransform() {
    this.transform = { scale: 1, x: 0, y: 0 };
  }
}

export function getReferenceGraphController(topologyRevision: string) {
  const existing = graphControllers.get(topologyRevision);

  if (existing) {
    graphControllers.delete(topologyRevision);
    graphControllers.set(topologyRevision, existing);
    return existing;
  }

  const controller = new ReferenceGraphController();
  graphControllers.set(topologyRevision, controller);

  while (graphControllers.size > maximumCachedGraphControllers) {
    const oldestRevision = graphControllers.keys().next().value;

    if (oldestRevision === undefined) {
      break;
    }

    graphControllers.delete(oldestRevision);
  }

  return controller;
}
