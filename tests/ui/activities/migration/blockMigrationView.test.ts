import { describe, expect, it } from "vitest";
import type { CtnBlock } from "../../../../src/ctn/parser/types";
import {
  flattenBlockSubtree,
  getBlockLineLabel,
  getBlockTitle,
  getTargetPositionLabel,
} from "../../../../src/ui/activities/migration/blockMigrationView";

function createBlock(
  id: string,
  lineNumber: number,
  children: CtnBlock[] = [],
): CtnBlock {
  const lastChild = children[children.length - 1];

  return {
    children,
    diagnostics: [],
    endLineNumber: lastChild?.endLineNumber ?? lineNumber,
    id,
    indentText: "",
    inlineSpans: [],
    label: "组分",
    level: 0,
    lineNumber,
    marker: "-",
    rawText: `- Block ${id}`,
    role: "normal",
    text: `Block ${id}`,
    textColor: "green",
    tone: "green",
    type: "item",
  };
}

describe("block migration view helpers", () => {
  it("formats block labels and flattens block subtrees", () => {
    const child = createBlock("child", 2);
    const root = createBlock("root", 1, [child]);

    expect(getBlockTitle(root)).toBe("Block root");
    expect(getBlockLineLabel(root)).toBe("L1-2");
    expect(flattenBlockSubtree(root).map((block) => block.id)).toEqual([
      "root",
      "child",
    ]);
  });

  it("labels migration target position values", () => {
    expect(getTargetPositionLabel("end")).toBe("文末根块");
    expect(getTargetPositionLabel("sibling-above:1")).toBe("上方并列");
    expect(getTargetPositionLabel("sibling-below:1")).toBe("下方并列");
    expect(getTargetPositionLabel("inside:1")).toBe("作为子结点");
    expect(() => getTargetPositionLabel("unknown:1")).toThrow(
      "Invalid block migration target position",
    );
  });
});
