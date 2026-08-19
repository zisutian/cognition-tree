import { describe, expect, it } from "vitest";
import {
  assignBlockSubtreeEndLineNumbers,
  findMultilineRange,
} from "../../../../core/ctn/parser/blockRanges";

type TestBlock = {
  level: number;
  lexicalEndLineNumber: number;
  lineNumber: number;
  rule: { semanticId: string };
  subtreeEndLineNumber: number;
};

function createBlock(
  lineNumber: number,
  level: number,
  type = "concept",
): TestBlock {
  return {
    level,
    lexicalEndLineNumber: lineNumber,
    lineNumber,
    rule: { semanticId: type },
    subtreeEndLineNumber: lineNumber,
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

    assignBlockSubtreeEndLineNumbers(blocks, 8, (block) => block.lineNumber);

    expect(blocks.map((block) => block.subtreeEndLineNumber)).toEqual([
      1,
      5,
      4,
      4,
      5,
      8,
    ]);
  });

  it("preserves an explicit multiline lexical end beyond the structural boundary", () => {
    const multilineBlock = createBlock(2, 0, "multiline-block");
    const nextBlock = createBlock(4, 0);

    multilineBlock.lexicalEndLineNumber = 5;
    multilineBlock.subtreeEndLineNumber = 5;
    assignBlockSubtreeEndLineNumbers(
      [multilineBlock, nextBlock],
      6,
      (block) => block.lineNumber,
    );

    expect(multilineBlock.lexicalEndLineNumber).toBe(5);
    expect(multilineBlock.subtreeEndLineNumber).toBe(5);
    expect(nextBlock.subtreeEndLineNumber).toBe(6);
  });

  it("requires an exact marker, exact indentation, and only trailing whitespace", () => {
    const lines = [
      "\t```ts",
      "\t````",
      "\t``` extra",
      "\t\t```",
      "\t```  ",
    ];

    expect(findMultilineRange(lines, 0, "\t", "```")).toEqual({
      closingFenceLineNumber: 5,
      contentEndLineNumber: 4,
      contentStartLineNumber: 2,
      status: "closed",
    });
  });

  it("returns an unterminated range through EOF", () => {
    expect(findMultilineRange(["```ts", "body"], 0, "", "```")).toEqual({
      closingFenceLineNumber: null,
      contentEndLineNumber: 2,
      contentStartLineNumber: 2,
      status: "unterminated",
    });
  });

  it("handles large deep trees without rescanning every descendant", () => {
    const deepBlockCount = 20_000;
    const blocks = [
      createBlock(1, 0, "title"),
      ...Array.from({ length: deepBlockCount }, (_, index) =>
        createBlock(index + 2, index),
      ),
    ];

    assignBlockSubtreeEndLineNumbers(
      blocks,
      blocks.length,
      (block) => block.lineNumber,
    );

    expect(blocks[1].subtreeEndLineNumber).toBe(blocks.length);
    expect(blocks.at(-1)?.subtreeEndLineNumber).toBe(blocks.length);
  });
});
