import { describe, expect, it } from "vitest";
import {
  graphNodeDragThreshold,
  updateGraphNodePointerMovement,
  type GraphNodePointerMovement,
} from "../../../../src/ui/activities/visualization/referenceGraphCanvasModel";

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
});
