import { describe, expect, it } from "vitest";
import { assignBlockEndLineNumbers } from "../../../src/ctn/parser/blockRanges";
import type { CtnBlock } from "../../../src/ctn/parser/types";

function createBlock(
  lineNumber: number,
  level: number,
  type = "concept",
): CtnBlock {
  return {
    children: [],
    diagnostics: [],
    endLineNumber: lineNumber,
    id: `block-${lineNumber}`,
    indentText: "",
    inlineSpans: [],
    label: type,
    level,
    lineNumber,
    marker: null,
    rawText: type,
    role: "normal",
    text: type,
    textColor: "default",
    tone: "default",
    type,
  };
}

describe("block ranges", () => {
  it("closes mixed sibling and ancestor ranges at the next peer", () => {
    const blocks = [
      createBlock(1, 0, "title"),
      createBlock(2, 0),
      createBlock(3, 1),
      createBlock(4, 2),
      createBlock(5, 1),
      createBlock(6, 0),
    ];

    assignBlockEndLineNumbers(blocks, 8);

    expect(blocks.map((block) => block.endLineNumber)).toEqual([
      1,
      5,
      4,
      4,
      5,
      8,
    ]);
  });

  it("preserves an explicit multiline end beyond the structural boundary", () => {
    const multilineBlock = createBlock(2, 0, "multiline-block");
    const nextBlock = createBlock(4, 0);

    multilineBlock.endLineNumber = 5;
    assignBlockEndLineNumbers([multilineBlock, nextBlock], 6);

    expect(multilineBlock.endLineNumber).toBe(5);
    expect(nextBlock.endLineNumber).toBe(6);
  });

  it("handles large deep trees without rescanning every descendant", () => {
    const deepBlockCount = 20_000;
    const blocks = [
      createBlock(1, 0, "title"),
      ...Array.from({ length: deepBlockCount }, (_, index) =>
        createBlock(index + 2, index),
      ),
    ];

    assignBlockEndLineNumbers(blocks, blocks.length);

    expect(blocks[1].endLineNumber).toBe(blocks.length);
    expect(blocks.at(-1)?.endLineNumber).toBe(blocks.length);
  });
});
