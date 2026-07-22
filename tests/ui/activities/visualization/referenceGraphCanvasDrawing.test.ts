import { describe, expect, it } from "vitest";
import type { GraphSimulationLink, GraphSimulationNode } from "../../../../presentation/activities/views/visualization/referenceGraphCanvasModel";
import {
  getReferenceGraphEdgeOpacity,
  getReferenceGraphFocusNodeIds,
  getReferenceGraphLabelOpacity,
  getReferenceGraphLineEndpoints,
  getReferenceGraphLinkWidth,
  getReferenceGraphNodeDrawRadius,
  getReferenceGraphNodeOpacity,
  rankReferenceGraphNodesForLabels,
} from "../../../../presentation/activities/views/visualization/referenceGraphCanvasDrawing";

function createNode(
  id: string,
  referencesIn: number,
  referencesOut: number,
): GraphSimulationNode {
  return {
    id,
    isolated: referencesIn + referencesOut === 0,
    radius: 5,
    referencesIn,
    referencesOut,
    title: id,
    x: id === "a" ? 0 : 100,
    y: 0,
  };
}

describe("reference graph canvas drawing", () => {
  it("scales compact nodes and weighted links within drawing bounds", () => {
    const node = createNode("a", 1, 1);

    expect(getReferenceGraphNodeDrawRadius(node, 1.5)).toBe(7.5);
    expect(getReferenceGraphLinkWidth(1, 1)).toBeGreaterThan(1);
    expect(getReferenceGraphLinkWidth(100, 2)).toBeLessThanOrEqual(4);
  });

  it("focuses the hovered node and its direct neighbors", () => {
    const a = createNode("a", 0, 1);
    const b = createNode("b", 1, 1);
    const c = createNode("c", 1, 0);
    const links: GraphSimulationLink[] = [
      {
        count: 1,
        id: "a-b",
        source: a,
        sourceNoteId: "a",
        target: b,
        targetNoteId: "b",
        targetTitle: "b",
      },
      {
        count: 1,
        id: "b-c",
        source: b,
        sourceNoteId: "b",
        target: c,
        targetNoteId: "c",
        targetTitle: "c",
      },
    ];
    const focused = getReferenceGraphFocusNodeIds("a", links);

    expect([...focused ?? []]).toEqual(["a", "b"]);
    expect(getReferenceGraphNodeOpacity("b", focused)).toBe(1);
    expect(getReferenceGraphNodeOpacity("c", focused)).toBe(0.18);
    expect(getReferenceGraphEdgeOpacity({
      hoveredNoteId: "a",
      selectedNoteId: null,
      sourceId: "a",
      targetId: "b",
    })).toBe(0.88);
    expect(getReferenceGraphEdgeOpacity({
      hoveredNoteId: "a",
      selectedNoteId: null,
      sourceId: "b",
      targetId: "c",
    })).toBe(0.08);
  });

  it("ranks labels by reference count and always reveals emphasized labels", () => {
    const nodes = [
      createNode("low", 0, 0),
      createNode("high", 4, 3),
      createNode("middle", 2, 1),
    ];

    expect(rankReferenceGraphNodesForLabels(nodes).map(({ id }) => id))
      .toEqual(["high", "middle", "low"]);
    expect(getReferenceGraphLabelOpacity({
      emphasized: true,
      labelDensity: 0,
      nodeCount: 100,
      rank: 99,
      scale: 0.35,
    })).toBe(1);
    expect(getReferenceGraphLabelOpacity({
      emphasized: false,
      labelDensity: 0,
      nodeCount: 100,
      rank: 0,
      scale: 1,
    })).toBe(0);
    expect(getReferenceGraphLabelOpacity({
      emphasized: false,
      labelDensity: 75,
      nodeCount: 100,
      rank: 10,
      scale: 1.5,
    })).toBeGreaterThan(0);
  });

  it("leaves room for an optional arrow before the target node", () => {
    const source = createNode("a", 0, 1);
    const target = createNode("b", 1, 0);
    const plain = getReferenceGraphLineEndpoints({
      nodeScale: 1,
      showArrow: false,
      source,
      target,
    });
    const directed = getReferenceGraphLineEndpoints({
      nodeScale: 1,
      showArrow: true,
      source,
      target,
    });

    expect(plain).not.toBeNull();
    expect(directed).not.toBeNull();
    expect(directed!.endX).toBeLessThan(plain!.endX);
    expect(directed!.endX).toBeLessThan(target.x - target.radius);
  });
});
