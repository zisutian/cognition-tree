import { describe, expect, it } from "vitest";
import type { ForceCenter, ForceLink, ForceManyBody } from "d3-force";
import {
  createInitialNode,
  getNextGraphKeyboardNode,
  graphNodeDragThreshold,
  releaseGraphSimulationNode,
  updateGraphNodePointerMovement,
  type GraphNodePointerMovement,
  type GraphSimulationLink,
  type GraphSimulationNode,
} from "../../../../../presentation/activities/notes/graph/referenceGraphCanvasModel";
import {
  consumeReferenceGraphResetSignal,
  ReferenceGraphControllerCache,
  ReferenceGraphController,
} from "../../../../../presentation/activities/notes/graph/referenceGraphController";
import {
  createReferenceGraphSimulation,
  resizeReferenceGraphSimulation,
  updateReferenceGraphSimulationForces,
} from "../../../../../presentation/activities/notes/graph/referenceGraphSimulation";
import {
  defaultReferenceGraphSettings,
} from "../../../../../presentation/activities/notes/graph/referenceGraphSettings";

function createMovement(): GraphNodePointerMovement {
  return {
    dragStarted: false,
    startGraphX: 10,
    startGraphY: 20,
  };
}

describe("reference graph canvas pointer movement", () => {
  it("seeds nodes in a deterministic phyllotaxis scatter instead of one ring", () => {
    const node = {
      id: "note-a",
      isolated: false,
      referencesIn: 1,
      referencesOut: 1,
      radius: 5,
      title: "Alpha",
    };
    const nodes = Array.from({ length: 8 }, (_, index) =>
      createInitialNode(node, index, 8, 800, 600)
    );
    const radii = nodes.map(({ x, y }) =>
      Math.round(Math.hypot(x - 400, y - 300))
    );

    expect(nodes[0]).toMatchObject({ x: 400, y: 300 });
    expect(new Set(radii).size).toBeGreaterThan(3);
    expect(
      Array.from({ length: 8 }, (_, index) =>
        createInitialNode(node, index, 8, 800, 600)
      ),
    ).toEqual(nodes);
  });

  it("keeps repeated node clicks below the drag threshold", () => {
    const movement = createMovement();

    expect(updateGraphNodePointerMovement(movement, { x: 10, y: 20 }))
      .toBe(movement);
    expect(
      updateGraphNodePointerMovement(movement, {
        x: 10 + graphNodeDragThreshold - 0.1,
        y: 20,
      }),
    ).toBe(movement);
  });

  it("starts a drag once and keeps the drag state after crossing the threshold", () => {
    const movement = createMovement();
    const dragging = updateGraphNodePointerMovement(movement, {
      x: 10 + graphNodeDragThreshold,
      y: 20,
    });

    expect(dragging).toEqual({ ...movement, dragStarted: true });
    expect(updateGraphNodePointerMovement(dragging, { x: 10, y: 20 }))
      .toBe(dragging);
  });

  it("releases pinned node coordinates for every pointer termination path", () => {
    const node = {
      id: "note-a",
      isolated: false,
      referencesIn: 0,
      referencesOut: 1,
      radius: 6,
      title: "Alpha",
      x: 10,
      y: 20,
      fx: 12,
      fy: 22,
    };

    releaseGraphSimulationNode(node);

    expect(node.fx).toBeNull();
    expect(node.fy).toBeNull();
  });

  it("cycles keyboard selection and starts at the first node", () => {
    const nodes = [
      {
        id: "note-a",
        isolated: false,
        referencesIn: 0,
        referencesOut: 1,
        radius: 6,
        title: "Alpha",
      },
      {
        id: "note-b",
        isolated: false,
        referencesIn: 1,
        referencesOut: 0,
        radius: 6,
        title: "Beta",
      },
    ];

    expect(getNextGraphKeyboardNode(nodes, null, 1)?.id).toBe("note-a");
    expect(getNextGraphKeyboardNode(nodes, "note-b", 1)?.id).toBe("note-a");
    expect(getNextGraphKeyboardNode(nodes, "note-a", -1)?.id).toBe("note-b");
  });

  it("keeps viewport and node positions in the graph controller", () => {
    const controller = new ReferenceGraphController();
    const nodes = controller.createNodes(
      [
        {
          id: "note-a",
          isolated: true,
          referencesIn: 0,
          referencesOut: 0,
          radius: 4,
          title: "Alpha",
        },
      ],
      400,
      300,
    );

    nodes[0]!.x = 88;
    nodes[0]!.y = 99;
    controller.capturePositions(nodes);
    controller.transform = { scale: 1.5, x: 20, y: 30 };

    expect(controller.createNodes(nodes, 800, 600)[0]).toMatchObject({
      x: 88,
      y: 99,
    });
    expect(controller.transform).toEqual({ scale: 1.5, x: 20, y: 30 });
    expect(controller.hasCachedLayout(nodes, "default")).toBe(true);
    expect(controller.hasCachedLayout(nodes, "different-forces")).toBe(false);
  });

  it("recenters cached positions for a changed canvas without changing their span", () => {
    const controller = new ReferenceGraphController();
    const visibleNodes = [
      {
        id: "note-a",
        isolated: false,
        referencesIn: 0,
        referencesOut: 1,
        radius: 5,
        title: "Alpha",
      },
      {
        id: "note-b",
        isolated: false,
        referencesIn: 1,
        referencesOut: 0,
        radius: 5,
        title: "Beta",
      },
    ];
    const nodes = controller.createNodes(visibleNodes, 400, 300);

    nodes[0]!.x = 100;
    nodes[0]!.y = 100;
    nodes[1]!.x = 220;
    nodes[1]!.y = 180;
    controller.capturePositions(
      nodes,
      "forces",
      { height: 300, width: 400 },
      0.42,
    );

    const restored = controller.createNodes(visibleNodes, 800, 600);

    expect(restored.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 300, y: 250 },
      { x: 420, y: 330 },
    ]);
    expect(Math.hypot(
      restored[1]!.x - restored[0]!.x,
      restored[1]!.y - restored[0]!.y,
    )).toBe(Math.hypot(120, 80));
    expect(controller.hasCachedLayout(visibleNodes, "forces")).toBe(true);
    expect(controller.getCachedLayoutAlpha(visibleNodes, "forces")).toBe(0.42);
  });

  it("restores the same controller after leaving and reopening a topology", () => {
    const cache = new ReferenceGraphControllerCache();
    const topologyIdentity = {};
    const first = cache.get(topologyIdentity, "reopen-test");

    first.transform = { scale: 2, x: 40, y: 50 };

    expect(cache.get(topologyIdentity, "reopen-test")).toBe(first);
    expect(cache.get(topologyIdentity, "reopen-test").transform).toEqual({
      scale: 2,
      x: 40,
      y: 50,
    });
    expect(cache.get({}, "reopen-test")).not.toBe(first);
    expect(
      new ReferenceGraphControllerCache().get(
        topologyIdentity,
        "reopen-test",
      ),
    ).not.toBe(first);
  });

  it("preserves a cached viewport on mount and resets only for a new signal", () => {
    const handledSignal = { current: 0 };

    expect(consumeReferenceGraphResetSignal(handledSignal, 0)).toBe(false);
    expect(consumeReferenceGraphResetSignal(handledSignal, 1)).toBe(true);
    expect(handledSignal.current).toBe(1);
    expect(consumeReferenceGraphResetSignal(handledSignal, 1)).toBe(false);
  });

  it("recenters an existing simulation without rebuilding it", () => {
    const nodes = [
      {
        id: "note-a",
        isolated: true,
        referencesIn: 0,
        referencesOut: 0,
        radius: 4,
        title: "Alpha",
        x: 10,
        y: 10,
      },
    ];
    const simulation = createReferenceGraphSimulation({
      height: 300,
      links: [],
      nodes,
      settings: { ...defaultReferenceGraphSettings.forces },
      width: 400,
      onTick: () => undefined,
    });

    simulation.stop().alpha(0.08);
    expect(resizeReferenceGraphSimulation(
      simulation,
      nodes,
      { height: 300, width: 400 },
      { height: 600, width: 800 },
    )).toBe(simulation);
    expect(simulation.force("center")).toBeDefined();
    expect(nodes[0]).toMatchObject({ x: 210, y: 160 });
    expect(simulation.alpha()).toBe(0.08);
    simulation.stop();
  });

  it("keeps a settled restored layout stopped until an explicit interaction", () => {
    const nodes = [
      {
        id: "note-a",
        isolated: true,
        referencesIn: 0,
        referencesOut: 0,
        radius: 3,
        title: "Alpha",
        x: 10,
        y: 10,
      },
    ];
    const simulation = createReferenceGraphSimulation({
      height: 300,
      initialAlpha: 0,
      links: [],
      nodes,
      settings: { ...defaultReferenceGraphSettings.forces },
      width: 400,
      onTick: () => undefined,
    });

    expect(simulation.alpha()).toBe(0);
    expect(nodes[0]).toMatchObject({ x: 10, y: 10 });
    simulation.stop();
  });

  it("resumes an interrupted cached layout at its previous temperature", () => {
    const nodes = [
      {
        id: "note-a",
        isolated: true,
        referencesIn: 0,
        referencesOut: 0,
        radius: 3,
        title: "Alpha",
        x: 10,
        y: 10,
      },
    ];
    const simulation = createReferenceGraphSimulation({
      height: 300,
      initialAlpha: 0.42,
      links: [],
      nodes,
      settings: { ...defaultReferenceGraphSettings.forces },
      width: 400,
      onTick: () => undefined,
    });

    expect(simulation.alpha()).toBe(0.42);
    simulation.stop();
  });

  it("updates force parameters without replacing the simulation", () => {
    const nodes: GraphSimulationNode[] = [
      {
        id: "note-a",
        isolated: false,
        referencesIn: 0,
        referencesOut: 1,
        radius: 5,
        title: "Alpha",
        x: 10,
        y: 10,
      },
      {
        id: "note-b",
        isolated: false,
        referencesIn: 1,
        referencesOut: 0,
        radius: 5,
        title: "Beta",
        x: 100,
        y: 10,
      },
    ];
    const links: GraphSimulationLink[] = [
      {
        count: 1,
        id: "note-a->note-b",
        source: "note-a",
        sourceNoteId: "note-a",
        target: "note-b",
        targetNoteId: "note-b",
        targetTitle: "Beta",
      },
    ];
    const simulation = createReferenceGraphSimulation({
      height: 300,
      links,
      nodes,
      settings: { ...defaultReferenceGraphSettings.forces },
      width: 400,
      onTick: () => undefined,
    });

    expect(
      updateReferenceGraphSimulationForces(simulation, {
        centerStrength: 0.4,
        linkDistance: 160,
        linkStrength: 0.6,
        repulsion: 420,
      }),
    ).toBe(simulation);
    expect(simulation.alpha()).toBeGreaterThanOrEqual(0.35);
    const center = simulation.force("center") as ForceCenter<GraphSimulationNode>;
    const charge = simulation.force("charge") as ForceManyBody<GraphSimulationNode>;
    const link = simulation.force("link") as ForceLink<
      GraphSimulationNode,
      GraphSimulationLink
    >;

    expect(center.strength()).toBe(0.4);
    expect(charge.strength()(nodes[0]!, 0, nodes)).toBe(-420);
    expect(link.distance()(links[0]!, 0, links)).toBe(160);
    expect(link.strength()(links[0]!, 0, links)).toBe(0.6);
    simulation.stop();
  });
});
