import { describe, expect, it } from "vitest";
import {
  defaultStructureTreeIndentUnitCount,
  defaultStructureTreeIndentWidthPx,
  getStructureTreeIndentWidthPx,
  normalizeStructureTreeIndentUnitCount,
  projectStructureContent,
  type StructureTreeNode,
} from "../../../../presentation/ui/shared/tree/index";

function node(id: string, children: StructureTreeNode[] = []): StructureTreeNode {
  return {
    id, children, label: "顶格概念", lineLabel: "L1", lineNumber: 1,
    textDisplay: {
      displayText: id,
      segments: [{ id, kind: "text", text: id }],
      textColor: "default",
    },
  };
}

describe("treeProjection", () => {
  it("projects identity, hierarchy, diagnostics, and optional type labels", () => {
    const child = node("child");
    const root = { ...node("root", [child]), diagnostics: [
      { severity: "warning" as const, message: "first" },
      { severity: "error" as const, message: "second" },
    ] };
    const shown = projectStructureContent([root]);
    expect(shown.nodes[0]).toMatchObject({
      id: "root", typeLabel: "顶格概念", position: { label: "L1" },
      diagnostic: { severity: "error", message: "first\nsecond" },
      children: [{ id: "child" }],
    });
    expect(shown.branchIds.has("root")).toBe(true);
    expect(shown.parentById.get("child")).toBe("root");
    const hidden = projectStructureContent([root], false);
    expect(hidden.nodes[0].typeLabel).toBeUndefined();
    expect(hidden.nodes[0].diagnostic).toEqual(shown.nodes[0].diagnostic);
    expect(hidden.nodes[0].position).toEqual(shown.nodes[0].position);
  });

  it("projects a 10,001-node chain without recursive traversal", () => {
    let root = node("leaf");
    for (let depth = 10_000; depth > 0; depth -= 1) root = node(`depth-${depth}`, [root]);
    const projection = projectStructureContent([root]);
    expect(projection.nodeById.size).toBe(10_001);
    expect(projection.parentById.get("leaf")).toBe("depth-10000");
  });

  it("normalizes syntax indentation into the existing visual unit", () => {
    expect(normalizeStructureTreeIndentUnitCount(2.9)).toBe(2);
    expect(normalizeStructureTreeIndentUnitCount(0)).toBe(defaultStructureTreeIndentUnitCount);
    expect(normalizeStructureTreeIndentUnitCount(Number.NaN)).toBe(defaultStructureTreeIndentUnitCount);
    expect(getStructureTreeIndentWidthPx(8)).toBe(defaultStructureTreeIndentWidthPx * 2);
  });
});
