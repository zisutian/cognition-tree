import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../src/ctn-parser/parseCtnDocument";
import {
  moveNoteBlockText,
  type BlockMigrationBlock,
} from "../../../src/workspace/actions/blockMigrationText";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";

function parseBlocks(source: string): BlockMigrationBlock[] {
  return parseCtnDocument(source, defaultCtnSyntaxProfile).blocks;
}

describe("block migration text", () => {
  it("moves a whole subtree between notes and rewrites indentation", () => {
    const sourceSource = "Root\n\t: Definition\n\t\t- Component\nSibling";
    const targetSource = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlockText({
      sourceBlock: sourceBlocks[1],
      sourceSource,
      targetPosition: {
        block: targetBlocks[0],
        kind: "inside-block",
      },
      targetSource,
    });

    expect(result).toEqual({
      nextSourceSource: "Root\nSibling",
      nextTargetSource:
        "Target\n\t> Understanding\n\t: Definition\n\t\t- Component",
      status: "moved",
    });
  });

  it("moves a subtree above a target block as a sibling", () => {
    const sourceSource = "Root\n\t: Definition\n\t\t- Component";
    const targetSource = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlockText({
      sourceBlock: sourceBlocks[1],
      sourceSource,
      targetPosition: {
        block: targetBlocks[0],
        kind: "sibling-above",
      },
      targetSource,
    });

    expect(result).toEqual({
      nextSourceSource: "Root",
      nextTargetSource:
        ": Definition\n\t- Component\nTarget\n\t> Understanding",
      status: "moved",
    });
  });

  it("moves a subtree below a target block as a sibling", () => {
    const sourceSource = "Root\n\t: Definition\n\t\t- Component";
    const targetSource = "Target\n\t> Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlockText({
      sourceBlock: sourceBlocks[1],
      sourceSource,
      targetPosition: {
        block: targetBlocks[0],
        kind: "sibling-below",
      },
      targetSource,
    });

    expect(result).toEqual({
      nextSourceSource: "Root",
      nextTargetSource:
        "Target\n\t> Understanding\n: Definition\n\t- Component",
      status: "moved",
    });
  });

  it("moves a root block to an empty target note", () => {
    const sourceSource = "Root\n\t: Definition";
    const sourceBlocks = parseBlocks(sourceSource);

    expect(
      moveNoteBlockText({
        sourceBlock: sourceBlocks[0],
        sourceSource,
        targetPosition: { kind: "end" },
        targetSource: "",
      }),
    ).toEqual({
      nextSourceSource: "",
      nextTargetSource: "Root\n\t: Definition",
      status: "moved",
    });
  });

  it("inserts before a target terminal newline", () => {
    const sourceSource = "Root";
    const sourceBlocks = parseBlocks(sourceSource);

    expect(
      moveNoteBlockText({
        sourceBlock: sourceBlocks[0],
        sourceSource,
        targetPosition: { kind: "end" },
        targetSource: "Target\n",
      }),
    ).toEqual({
      nextSourceSource: "",
      nextTargetSource: "Target\nRoot\n",
      status: "moved",
    });
  });

  it("keeps multiline block contents relative to the moved subtree", () => {
    const sourceSource = "Root\n\t```ts\n\t\tconst value = 1;\n\t```";
    const sourceBlocks = parseBlocks(sourceSource);

    expect(
      moveNoteBlockText({
        sourceBlock: sourceBlocks[1],
        sourceSource,
        targetPosition: { kind: "end" },
        targetSource: "",
      }),
    ).toEqual({
      nextSourceSource: "Root",
      nextTargetSource: "```ts\n\tconst value = 1;\n```",
      status: "moved",
    });
  });
});
