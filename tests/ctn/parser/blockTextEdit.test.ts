import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../src/ctn/parser/parseCtnDocument";
import {
  moveCtnBlockText,
  type CtnBlockTextRange,
} from "../../../src/ctn/parser/blockTextEdit";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";

function parseBlocks(source: string): CtnBlockTextRange[] {
  return parseCtnDocument(source, defaultCtnSyntaxProfile).blocks;
}

describe("ctn block text edit", () => {
  it("moves a whole subtree between source texts and rewrites indentation", () => {
    const sourceText = "Root\n\t: Definition\n\t\t- Component\nSibling";
    const targetText = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[1],
      sourceText,
      targetPosition: {
        block: targetBlocks[0],
        kind: "inside-block",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Root\nSibling",
      nextTargetText:
        "Target\n\t> Understanding\n\t: Definition\n\t\t- Component",
      status: "moved",
    });
  });

  it("moves a subtree above a target block as a sibling", () => {
    const sourceText = "Root\n\t: Definition\n\t\t- Component";
    const targetText = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[1],
      sourceText,
      targetPosition: {
        block: targetBlocks[0],
        kind: "sibling-above",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Root",
      nextTargetText:
        ": Definition\n\t- Component\nTarget\n\t> Understanding",
      status: "moved",
    });
  });

  it("moves a subtree below a target block as a sibling", () => {
    const sourceText = "Root\n\t: Definition\n\t\t- Component";
    const targetText = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[1],
      sourceText,
      targetPosition: {
        block: targetBlocks[0],
        kind: "sibling-below",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Root",
      nextTargetText:
        "Target\n\t> Understanding\n: Definition\n\t- Component",
      status: "moved",
    });
  });

  it("moves a root block to empty target text", () => {
    const sourceText = "Root\n\t: Definition";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[0],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "",
      }),
    ).toEqual({
      nextSourceText: "",
      nextTargetText: "Root\n\t: Definition",
      status: "moved",
    });
  });

  it("inserts before a target terminal newline", () => {
    const sourceText = "Root";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[0],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "Target\n",
      }),
    ).toEqual({
      nextSourceText: "",
      nextTargetText: "Target\nRoot\n",
      status: "moved",
    });
  });

  it("keeps multiline block contents relative to the moved subtree", () => {
    const sourceText = "Root\n\t```ts\n\t\tconst value = 1;\n\t```";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[1],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "",
      }),
    ).toEqual({
      nextSourceText: "Root",
      nextTargetText: "```ts\n\tconst value = 1;\n```",
      status: "moved",
    });
  });
});
