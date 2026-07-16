import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import type {
  GraphSimulationLink,
  GraphSimulationNode,
} from "./referenceGraphCanvasModel";

export function createReferenceGraphSimulation({
  height,
  links,
  nodes,
  width,
  onTick,
}: {
  height: number;
  links: GraphSimulationLink[];
  nodes: GraphSimulationNode[];
  width: number;
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
        .distance((edge) => Math.max(76, 152 - Math.min(edge.count, 8) * 7))
        .strength(0.34),
    )
    .force("charge", forceManyBody<GraphSimulationNode>().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide<GraphSimulationNode>().radius((node) => node.radius + 12),
    )
    .alpha(0.9)
    .alphaDecay(0.045)
    .on("tick", onTick);
}

export function resizeReferenceGraphSimulation(
  simulation: Simulation<GraphSimulationNode, GraphSimulationLink>,
  width: number,
  height: number,
) {
  simulation
    .force("center", forceCenter(width / 2, height / 2))
    .alpha(Math.max(simulation.alpha(), 0.2))
    .restart();

  return simulation;
}
