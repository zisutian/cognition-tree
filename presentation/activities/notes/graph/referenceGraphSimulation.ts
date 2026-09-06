import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceCenter,
  type ForceLink,
  type ForceManyBody,
  type Simulation,
} from "d3-force";
import type {
  GraphSimulationLink,
  GraphSimulationNode,
} from "./referenceGraphCanvasModel.ts";
import type { GraphForceSettings } from "./referenceGraphSettings.ts";

export function createReferenceGraphSimulation({
  height,
  initialAlpha = 0.9,
  links,
  nodes,
  width,
  settings,
  onTick,
}: {
  height: number;
  initialAlpha?: number;
  links: GraphSimulationLink[];
  nodes: GraphSimulationNode[];
  width: number;
  settings: GraphForceSettings;
  onTick: () => void;
}) {
  const layoutLinks = links.filter(
    (link) => link.sourceNoteId !== link.targetNoteId,
  );

  const simulation = forceSimulation<GraphSimulationNode, GraphSimulationLink>(
    nodes,
  )
    .force(
      "link",
      forceLink<GraphSimulationNode, GraphSimulationLink>(layoutLinks)
        .id((node) => node.id)
        .distance(settings.linkDistance)
        .strength(settings.linkStrength),
    )
    .force(
      "charge",
      forceManyBody<GraphSimulationNode>().strength(-settings.repulsion),
    )
    .force(
      "center",
      forceCenter(width / 2, height / 2).strength(settings.centerStrength),
    )
    .force(
      "collide",
      forceCollide<GraphSimulationNode>().radius((node) => node.radius + 12),
    )
    .alpha(initialAlpha)
    .alphaDecay(0.045)
    .on("tick", onTick);

  if (initialAlpha <= simulation.alphaMin()) {
    simulation.stop();
  }

  return simulation;
}

export function updateReferenceGraphSimulationForces(
  simulation: Simulation<GraphSimulationNode, GraphSimulationLink>,
  settings: GraphForceSettings,
) {
  const link = simulation.force("link") as
    | ForceLink<GraphSimulationNode, GraphSimulationLink>
    | undefined;
  const charge = simulation.force("charge") as
    | ForceManyBody<GraphSimulationNode>
    | undefined;
  const center = simulation.force("center") as
    | ForceCenter<GraphSimulationNode>
    | undefined;

  link?.distance(settings.linkDistance).strength(settings.linkStrength);
  charge?.strength(-settings.repulsion);
  center?.strength(settings.centerStrength);
  simulation.alpha(Math.max(simulation.alpha(), 0.35)).restart();

  return simulation;
}

export function resizeReferenceGraphSimulation(
  simulation: Simulation<GraphSimulationNode, GraphSimulationLink>,
  nodes: GraphSimulationNode[],
  previousSize: { height: number; width: number },
  nextSize: { height: number; width: number },
) {
  const center = simulation.force("center") as
    | ForceCenter<GraphSimulationNode>
    | undefined;

  const offsetX = (nextSize.width - previousSize.width) / 2;
  const offsetY = (nextSize.height - previousSize.height) / 2;

  for (const node of nodes) {
    node.x += offsetX;
    node.y += offsetY;

    if (typeof node.fx === "number") {
      node.fx += offsetX;
    }

    if (typeof node.fy === "number") {
      node.fy += offsetY;
    }
  }

  center?.x(nextSize.width / 2).y(nextSize.height / 2);

  return simulation;
}
