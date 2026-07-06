import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../src/ctn/parser/parseCtnDocument";
import {
  moveCtnBlockWithinText,
  moveCtnBlockText,
  type CtnBlockTextRange,
} from "../../../src/ctn/parser/blockTextEdit";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";

function parseBlocks(source: string): CtnBlockTextRange[] {
  return parseCtnDocument(source, defaultCtnSyntaxProfile).blocks;
}

function findBlock(source: string, lineNumber: number) {
  const block = parseBlocks(source).find(
    (entry) => entry.lineNumber === lineNumber,
  );

  if (!block) {
    throw new Error(`Expected block at line ${lineNumber}.`);
  }

  return block;
}

describe("ctn block text edit", () => {
  it("moves a whole subtree between source texts and rewrites indentation", () => {
    const sourceText =
      "Source Title\nRoot\n\t: Definition\n\t\t- Component\nSibling";
    const targetText = "Target Title\nTarget\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[2],
      sourceText,
      targetPosition: {
        block: targetBlocks[1],
        kind: "inside-block",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Source Title\nRoot\nSibling",
      nextTargetText:
        "Target Title\nTarget\n\t> Understanding\n\t: Definition\n\t\t- Component",
      status: "moved",
    });
  });

  it("moves a subtree above a target block as a sibling", () => {
    const sourceText = "Source Title\nRoot\n\t: Definition\n\t\t- Component";
    const targetText = "Target Title\nTarget\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[2],
      sourceText,
      targetPosition: {
        block: targetBlocks[1],
        kind: "sibling-above",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText:
        "Target Title\n: Definition\n\t- Component\nTarget\n\t> Understanding",
      status: "moved",
    });
  });

  it("moves a subtree below a target block as a sibling", () => {
    const sourceText = "Source Title\nRoot\n\t: Definition\n\t\t- Component";
    const targetText = "Target Title\nTarget\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceText);
    const targetBlocks = parseBlocks(targetText);
    const result = moveCtnBlockText({
      sourceBlock: sourceBlocks[2],
      sourceText,
      targetPosition: {
        block: targetBlocks[1],
        kind: "sibling-below",
      },
      targetText,
    });

    expect(result).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText:
        "Target Title\nTarget\n\t> Understanding\n: Definition\n\t- Component",
      status: "moved",
    });
  });

  it("moves a root block to empty target text", () => {
    const sourceText = "Source Title\nRoot\n\t: Definition";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[1],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "",
      }),
    ).toEqual({
      nextSourceText: "Source Title",
      nextTargetText: "Root\n\t: Definition",
      status: "moved",
    });
  });

  it("inserts before a target terminal newline", () => {
    const sourceText = "Source Title\nRoot";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[1],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "Target Title\n",
      }),
    ).toEqual({
      nextSourceText: "Source Title",
      nextTargetText: "Target Title\nRoot\n",
      status: "moved",
    });
  });

  it("keeps multiline block contents relative to the moved subtree", () => {
    const sourceText =
      "Source Title\nRoot\n\t```ts\n\t\tconst value = 1;\n\t```";
    const sourceBlocks = parseBlocks(sourceText);

    expect(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[2],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: "",
      }),
    ).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText: "```ts\n\tconst value = 1;\n```",
      status: "moved",
    });
  });

  it("moves a whole subtree within the same document", () => {
    const sourceText =
      "Title\nRoot\n\t: Definition\n\t\t- Component\nSibling";

    expect(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 2),
        sourceText,
        targetPosition: { kind: "end" },
      }),
    ).toEqual({
      nextText: "Title\nSibling\nRoot\n\t: Definition\n\t\t- Component",
      status: "moved",
    });
  });

  it("moves a same-document block to sibling positions", () => {
    const sourceText = "Title\nRoot\n\t: A\n\t: B\nOther";

    expect(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 3),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 4),
          kind: "sibling-below",
        },
      }),
    ).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t: A\nOther",
      status: "moved",
    });
    expect(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 4),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 3),
          kind: "sibling-above",
        },
      }),
    ).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t: A\nOther",
      status: "moved",
    });
  });

  it("moves a same-document block inside another block and rewrites indentation", () => {
    const sourceText = "Title\nRoot\n\t: A\n\t: B\nOther";

    expect(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 3),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 4),
          kind: "inside-block",
        },
      }),
    ).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t\t: A\nOther",
      status: "moved",
    });
  });

  it("rejects same-document targets inside the moved subtree", () => {
    const sourceText = "Title\nRoot\n\t: Definition\n\t\t- Component\nSibling";

    expect(() =>
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 2),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 3),
          kind: "inside-block",
        },
      }),
    ).toThrow("Cannot move a CTN block into its own subtree.");
  });
});
