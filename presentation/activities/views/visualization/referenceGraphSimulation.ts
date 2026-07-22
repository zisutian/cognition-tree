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
} from "./referenceGraphCanvasModel";
import type { GraphForceSettings } from "./referenceGraphSettings";

export function createReferenceGraphSimulation({
  height,
  links,
  nodes,
  width,
  settings,
  onTick,
}: {
  height: number;
  links: GraphSimulationLink[];
  nodes: GraphSimulationNode[];
  width: number;
  settings: GraphForceSettings;
  onTick: () => void;
}) {
  const layoutLinks = links.filter(
    (link) => link.sourceNoteId !== link.targetNoteId,
  );

  return forceSimulation<GraphSimulationNode, GraphSimulationLink>(nodes)
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
    .alpha(0.9)
    .alphaDecay(0.045)
    .on("tick", onTick);
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
  width: number,
  height: number,
) {
  const center = simulation.force("center") as
    | ForceCenter<GraphSimulationNode>
    | undefined;

  center?.x(width / 2).y(height / 2);
  simulation.alpha(Math.max(simulation.alpha(), 0.2)).restart();

  return simulation;
}
