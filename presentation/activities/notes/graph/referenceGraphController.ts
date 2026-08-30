import {
  createInitialNode,
  type GraphSimulationNode,
  type GraphTransform,
} from "./referenceGraphCanvasModel";
import type { VisibleReferenceGraphNode } from "./referenceGraphView";

const maximumCachedTopologyVariants = 12;

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
  private layoutAlpha: number | null = null;
  private layoutSettingsKey: string | null = null;
  private layoutSize: { height: number; width: number } | null = null;

  createNodes(
    nodes: VisibleReferenceGraphNode[],
    width: number,
    height: number,
  ): GraphSimulationNode[] {
    const offsetX = this.layoutSize ? (width - this.layoutSize.width) / 2 : 0;
    const offsetY = this.layoutSize ? (height - this.layoutSize.height) / 2 : 0;

    return nodes.map((node, index) => {
      const storedPosition = this.positions.get(node.id);

      return storedPosition
        ? {
            ...node,
            x: storedPosition.x + offsetX,
            y: storedPosition.y + offsetY,
          }
        : createInitialNode(node, index, nodes.length, width, height);
    });
  }

  capturePositions(
    nodes: GraphSimulationNode[],
    settingsKey = "default",
    size?: { height: number; width: number },
    alpha = 0,
  ) {
    const visibleNodeIds = new Set(nodes.map((node) => node.id));

    for (const nodeId of this.positions.keys()) {
      if (!visibleNodeIds.has(nodeId)) {
        this.positions.delete(nodeId);
      }
    }

    for (const node of nodes) {
      this.positions.set(node.id, { x: node.x, y: node.y });
    }

    this.layoutAlpha = alpha;
    this.layoutSettingsKey = settingsKey;
    this.layoutSize = size ? { ...size } : null;
  }

  hasCachedLayout(
    nodes: VisibleReferenceGraphNode[],
    settingsKey: string,
  ) {
    return this.getCachedLayoutAlpha(nodes, settingsKey) !== null;
  }

  getCachedLayoutAlpha(
    nodes: VisibleReferenceGraphNode[],
    settingsKey: string,
  ) {
    return nodes.length > 0 &&
      this.layoutSettingsKey === settingsKey &&
      nodes.every((node) => this.positions.has(node.id))
      ? this.layoutAlpha
      : null;
  }

  resetTransform() {
    this.transform = { scale: 1, x: 0, y: 0 };
  }
}

export class ReferenceGraphControllerCache {
  readonly #controllersByTopology = new WeakMap<
    object,
    Map<string, ReferenceGraphController>
  >();

  get(topologyIdentity: object, topologyVariant: string) {
    const controllers = this.#controllersByTopology.get(topologyIdentity) ??
      new Map<string, ReferenceGraphController>();
    const existing = controllers.get(topologyVariant);

    if (existing) {
      controllers.delete(topologyVariant);
      controllers.set(topologyVariant, existing);
      return existing;
    }

    const controller = new ReferenceGraphController();

    controllers.set(topologyVariant, controller);
    this.#controllersByTopology.set(topologyIdentity, controllers);
    while (controllers.size > maximumCachedTopologyVariants) {
      const oldestVariant = controllers.keys().next().value;

      if (oldestVariant === undefined) break;
      controllers.delete(oldestVariant);
    }
    return controller;
  }
}
