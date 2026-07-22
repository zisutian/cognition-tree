import { describe, expect, it } from "vitest";
import {
  getNextGraphKeyboardNode,
  graphNodeDragThreshold,
  releaseGraphSimulationNode,
  updateGraphNodePointerMovement,
  type GraphNodePointerMovement,
} from "../../../../presentation/activities/views/visualization/referenceGraphCanvasModel";
import {
  consumeReferenceGraphResetSignal,
  getReferenceGraphController,
  ReferenceGraphController,
} from "../../../../presentation/activities/views/visualization/referenceGraphController";
import {
  createReferenceGraphSimulation,
  resizeReferenceGraphSimulation,
} from "../../../../presentation/activities/views/visualization/referenceGraphSimulation";

function createMovement(): GraphNodePointerMovement {
  return {
    dragStarted: false,
    startGraphX: 10,
    startGraphY: 20,
  };
}

describe("reference graph canvas pointer movement", () => {
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
  });

  it("restores the same controller after leaving and reopening a topology", () => {
    const first = getReferenceGraphController("reopen-test");

    first.transform = { scale: 2, x: 40, y: 50 };

    expect(getReferenceGraphController("reopen-test")).toBe(first);
    expect(getReferenceGraphController("reopen-test").transform).toEqual({
      scale: 2,
      x: 40,
      y: 50,
    });
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
      width: 400,
      onTick: () => undefined,
    });

    expect(resizeReferenceGraphSimulation(simulation, 800, 600)).toBe(
      simulation,
    );
    expect(simulation.force("center")).toBeDefined();
    simulation.stop();
  });
});
