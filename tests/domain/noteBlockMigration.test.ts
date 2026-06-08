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
      sourceBlocks,
      sourceSource,
      targetPosition: {
        block: targetBlocks[0],
        kind: "after-block",
      },
      targetSource,
      targetSyntaxProfile: defaultCtnSyntaxProfile,
    });

    expect(result).toEqual({
      nextSourceSource: "Root\nSibling",
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
        sourceBlocks,
        sourceSource,
        targetPosition: { kind: "end" },
        targetSource: "",
        targetSyntaxProfile: defaultCtnSyntaxProfile,
      }),
    ).toEqual({
      nextSourceSource: "",
      nextTargetSource: "Root\n    : Definition",
      status: "moved",
    });
  });

  it("rejects target syntax that does not support moved markers", () => {
    const sourceSource = "Root\n    : Definition\n        - Component";
    const sourceBlocks = parseBlocks(sourceSource);
    const result = moveNoteBlock({
      sourceBlock: sourceBlocks[1],
      sourceBlocks,
      sourceSource,
      targetPosition: { kind: "end" },
      targetSource: "Target",
      targetSyntaxProfile: {
        markerRules: [{ marker: "```" }],
      },
    });

    expect(result).toEqual({
      message: "目标笔记语法不支持 marker: :, -。",
      missingMarkers: [":", "-"],
      status: "incompatible-target-syntax",
    });
  });
});
