import { describe, expect, it } from "vitest";
import { parseCtnCanonicalDocument } from "../../../core/ctn/parser/parseCtnDocument";
import {
  moveCtnBlockWithinText as moveCtnBlockWithinTextImplementation,
  moveCtnBlockText as moveCtnBlockTextImplementation,
  type MoveCtnBlockTextInput,
  type MoveCtnBlockWithinTextInput,
} from "../../../core/ctn/parser/blockTextEdit";
import type { CtnCanonicalBlock } from "../../../core/ctn/parser/types";
import { defaultCtnSyntaxProfile } from "../../../core/ctn/syntax/defaultSyntaxProfile";
import {
  addTestCtnBlockMetadata,
  stripTestCtnBlockMetadata,
} from "../metadata/sourceMetadataFixture";

const movedTimestamp = "2026-07-15T02:00:00.000Z";

function moveCtnBlockText(
  input: Omit<MoveCtnBlockTextInput, "syntaxProfile" | "updatedAt"> &
    Partial<Pick<MoveCtnBlockTextInput, "updatedAt">>,
) {
  return moveCtnBlockTextImplementation({
    ...input,
    syntaxProfile: defaultCtnSyntaxProfile,
    updatedAt: input.updatedAt ?? movedTimestamp,
  });
}

function moveCtnBlockWithinText(
  input: Omit<MoveCtnBlockWithinTextInput, "syntaxProfile" | "updatedAt"> &
    Partial<Pick<MoveCtnBlockWithinTextInput, "updatedAt">>,
) {
  return moveCtnBlockWithinTextImplementation({
    ...input,
    syntaxProfile: defaultCtnSyntaxProfile,
    updatedAt: input.updatedAt ?? movedTimestamp,
  });
}

function parseBlocks(source: string): CtnCanonicalBlock[] {
  return parseCtnCanonicalDocument(source, defaultCtnSyntaxProfile).blocks;
}

function findBlock(source: string, lineNumber: number) {
  const rawText = stripTestCtnBlockMetadata(source).split("\n")[lineNumber - 1];
  const block = parseBlocks(source).find(
    (entry) => entry.rawText === rawText,
  );

  if (!block) {
    throw new Error(`Expected block at line ${lineNumber}.`);
  }

  return block;
}

function stripMoveResult<Result extends Record<string, unknown>>(result: Result) {
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      key.startsWith("next") && typeof value === "string"
        ? stripTestCtnBlockMetadata(value)
        : value,
    ]),
  );
}

describe("ctn block text edit", () => {
  it("moves a whole subtree between source texts and rewrites indentation", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    );
    const targetText = addTestCtnBlockMetadata(
      "Target Title\nTarget\n\t> Understanding",
      defaultCtnSyntaxProfile,
      100,
    );
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

    expect(stripMoveResult(result)).toEqual({
      nextSourceText: "Source Title\nRoot\nSibling",
      nextTargetText:
        "Target Title\nTarget\n\t> Understanding\n\t: Definition\n\t\t- Component",
      status: "moved",
    });

    const movedRoot = parseCtnCanonicalDocument(
      result.nextTargetText,
      defaultCtnSyntaxProfile,
    ).blocks.find((block) => block.id === sourceBlocks[2].id);

    expect(movedRoot).toMatchObject({
      id: sourceBlocks[2].id,
      indentText: "\t",
      metadata: {
        createdAt: sourceBlocks[2].metadata.createdAt,
        updatedAt: movedTimestamp,
      },
    });
    expect(result.nextTargetText.split("\n")[movedRoot!.metadataLineNumber - 1])
      .toMatch(/^\t@ctn-block /);

    expect(parseBlocks(result.nextSourceText).slice(0, 2).map(
      (block) => block.metadata.updatedAt,
    )).toEqual([movedTimestamp, movedTimestamp]);
    expect(parseBlocks(result.nextTargetText).slice(0, 2).map(
      (block) => block.metadata.updatedAt,
    )).toEqual([movedTimestamp, movedTimestamp]);
  });

  it("moves a subtree above a target block as a sibling", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t: Definition\n\t\t- Component",
    );
    const targetText = addTestCtnBlockMetadata(
      "Target Title\nTarget\n\t> Understanding",
      defaultCtnSyntaxProfile,
      100,
    );
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

    expect(stripMoveResult(result)).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText:
        "Target Title\n: Definition\n\t- Component\nTarget\n\t> Understanding",
      status: "moved",
    });
  });

  it("moves a subtree below a target block as a sibling", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t: Definition\n\t\t- Component",
    );
    const targetText = addTestCtnBlockMetadata(
      "Target Title\nTarget\n\t> Understanding",
      defaultCtnSyntaxProfile,
      100,
    );
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

    expect(stripMoveResult(result)).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText:
        "Target Title\nTarget\n\t> Understanding\n: Definition\n\t- Component",
      status: "moved",
    });
  });

  it("moves a root block to the end of another canonical document", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t: Definition",
    );
    const sourceBlocks = parseBlocks(sourceText);
    const targetText = addTestCtnBlockMetadata(
      "Target Title",
      defaultCtnSyntaxProfile,
      100,
    );

    expect(stripMoveResult(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[1],
        sourceText,
        targetPosition: { kind: "end" },
        targetText,
      }),
    )).toEqual({
      nextSourceText: "Source Title",
      nextTargetText: "Target Title\nRoot\n\t: Definition",
      status: "moved",
    });
  });

  it("inserts before a target terminal newline", () => {
    const sourceText = addTestCtnBlockMetadata("Source Title\nRoot");
    const sourceBlocks = parseBlocks(sourceText);

    expect(stripMoveResult(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[1],
        sourceText,
        targetPosition: { kind: "end" },
        targetText: `${addTestCtnBlockMetadata(
          "Target Title",
          defaultCtnSyntaxProfile,
          100,
        )}\n`,
      }),
    )).toEqual({
      nextSourceText: "Source Title",
      nextTargetText: "Target Title\nRoot\n",
      status: "moved",
    });
  });

  it("keeps multiline block contents relative to the moved subtree", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t```ts\n\t\tconst value = 1;\n\t```",
    );
    const sourceBlocks = parseBlocks(sourceText);
    const targetText = addTestCtnBlockMetadata(
      "Target Title",
      defaultCtnSyntaxProfile,
      100,
    );

    expect(stripMoveResult(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[2],
        sourceText,
        targetPosition: { kind: "end" },
        targetText,
      }),
    )).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText: "Target Title\n```ts\n\tconst value = 1;\n```",
      status: "moved",
    });
  });

  it("does not trim multiline body lines that lack the opener indentation", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Source Title\nRoot\n\t```ts\nconst value = 1;\n\t\tconst nested = 2;\n\t```",
    );
    const sourceBlocks = parseBlocks(sourceText);
    const targetText = addTestCtnBlockMetadata(
      "Target Title",
      defaultCtnSyntaxProfile,
      100,
    );

    expect(stripMoveResult(
      moveCtnBlockText({
        sourceBlock: sourceBlocks[2],
        sourceText,
        targetPosition: { kind: "end" },
        targetText,
      }),
    )).toEqual({
      nextSourceText: "Source Title\nRoot",
      nextTargetText: "Target Title\n```ts\nconst value = 1;\n\tconst nested = 2;\n```",
      status: "moved",
    });
  });

  it("moves a whole subtree within the same document", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    );

    expect(stripMoveResult(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 2),
        sourceText,
        targetPosition: { kind: "end" },
      }),
    )).toEqual({
      nextText: "Title\nSibling\nRoot\n\t: Definition\n\t\t- Component",
      status: "moved",
    });
  });

  it("does not touch an unchanged descendant when its parent is reordered at the same level", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    );
    const before = parseBlocks(sourceText);
    const childBefore = before.find((block) => block.text === "Component");
    const result = moveCtnBlockWithinText({
      sourceBlock: findBlock(sourceText, 2),
      sourceText,
      targetPosition: { kind: "end" },
    });
    const after = parseBlocks(result.nextText);
    const movedRoot = after.find((block) => block.text === "Root");
    const unchangedChild = after.find((block) => block.text === "Component");

    expect(movedRoot?.metadata.updatedAt).toBe(movedTimestamp);
    expect(unchangedChild).toMatchObject({
      id: childBefore?.id,
      metadata: { updatedAt: childBefore?.metadata.updatedAt },
    });
  });

  it("moves a same-document block to sibling positions", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: A\n\t: B\nOther",
    );

    expect(stripMoveResult(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 3),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 4),
          kind: "sibling-below",
        },
      }),
    )).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t: A\nOther",
      status: "moved",
    });
    expect(stripMoveResult(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 4),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 3),
          kind: "sibling-above",
        },
      }),
    )).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t: A\nOther",
      status: "moved",
    });
  });

  it("moves a same-document block inside another block and rewrites indentation", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: A\n\t: B\nOther",
    );

    expect(stripMoveResult(
      moveCtnBlockWithinText({
        sourceBlock: findBlock(sourceText, 3),
        sourceText,
        targetPosition: {
          block: findBlock(sourceText, 4),
          kind: "inside-block",
        },
      }),
    )).toEqual({
      nextText: "Title\nRoot\n\t: B\n\t\t: A\nOther",
      status: "moved",
    });
  });

  it("rejects same-document targets inside the moved subtree", () => {
    const sourceText = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    );

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
