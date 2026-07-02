import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../src/ctn/parseOutline";
import {
  moveNoteBlock,
  type NoteBlockMigrationBlock,
} from "../../src/domain/noteBlockMigration";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";

function parseBlocks(source: string): NoteBlockMigrationBlock[] {
  return parseCtnDocument(source, {
    syntaxProfile: defaultCtnSyntaxProfile,
  }).blocks;
}

describe("note block migration", () => {
  it("moves a whole subtree between notes and rewrites indentation", () => {
    const sourceSource = "Root\n    : Definition\n        - Component\nSibling";
    const targetSource = "Target\n    > Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlock({
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
        "Target\n    > Understanding\n    : Definition\n        - Component",
      status: "moved",
    });
  });

  it("moves a subtree above a target block as a sibling", () => {
    const sourceSource = "Root\n    : Definition\n        - Component";
    const targetSource = "Target\n    > Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlock({
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
        ": Definition\n    - Component\nTarget\n    > Understanding",
      status: "moved",
    });
  });

  it("moves a subtree below a target block as a sibling", () => {
    const sourceSource = "Root\n    : Definition\n        - Component";
    const targetSource = "Target\n    > Understanding";
    const sourceBlocks = parseBlocks(sourceSource);
    const targetBlocks = parseBlocks(targetSource);
    const result = moveNoteBlock({
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
        "Target\n    > Understanding\n: Definition\n    - Component",
      status: "moved",
    });
  });

  it("moves a root block to an empty target note", () => {
    const sourceSource = "Root\n    : Definition";
    const sourceBlocks = parseBlocks(sourceSource);

    expect(
      moveNoteBlock({
        sourceBlock: sourceBlocks[0],
        sourceSource,
        targetPosition: { kind: "end" },
        targetSource: "",
      }),
    ).toEqual({
      nextSourceSource: "",
      nextTargetSource: "Root\n    : Definition",
      status: "moved",
    });
  });

});
