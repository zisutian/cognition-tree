import { describe, expect, it } from "vitest";
import { placeReferenceGraphLabels, type GraphLabelCandidate } from "../../../../../../presentation/activities/notes/graph/referenceGraphLabels";

const label = (id: string, x: number, y: number, priority = 2): GraphLabelCandidate => ({
  id, x, y, priority, radius: 5, width: 80, height: 18,
});

describe("graph label placement", () => {
  it("moves crowded labels to free space without overlapping nodes or other titles", () => {
    const candidates = [label("a", 100, 100, 1), label("b", 130, 110)];
    const result = placeReferenceGraphLabels({ candidates, nodes: candidates, gap: 4, width: 300, height: 250 });
    expect(result.size).toBe(2);
    const a = result.get("a")!;
    const b = result.get("b")!;
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    for (const rect of result.values()) {
      for (const node of candidates) {
        expect(rect.x + rect.width <= node.x - node.radius || rect.x >= node.x + node.radius || rect.y + rect.height <= node.y - node.radius || rect.y >= node.y + node.radius).toBe(true);
      }
    }
  });

  it("keeps the selected title visible at the canvas edge and omits offscreen nodes", () => {
    const candidates = [label("edge", 4, 148, 1), label("outside", -20, 50, 1)];
    const result = placeReferenceGraphLabels({ candidates, nodes: candidates, gap: 4, width: 160, height: 160 });
    expect(result.has("outside")).toBe(false);
    const edge = result.get("edge")!;
    expect(edge.x).toBeGreaterThanOrEqual(4);
    expect(edge.y + edge.height).toBeLessThanOrEqual(156);
  });

  it("reserves space for selection before placing lower priority labels", () => {
    const candidates = [label("ordinary", 50, 15), label("selected", 50, 15, 1)];
    const result = placeReferenceGraphLabels({ candidates, nodes: candidates, gap: 4, width: 100, height: 30 });
    expect(result.has("selected")).toBe(true);
    expect(result.has("ordinary")).toBe(false);
  });
});
