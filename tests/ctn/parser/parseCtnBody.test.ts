import { describe, expect, it } from "vitest";
import { parseCtnEditableBody } from "../../../core/ctn/parser/parseCtnBody";
import { defaultCtnSyntaxProfile } from "../../../core/ctn/syntax/defaultSyntaxProfile";

describe("CTN editable body projection", () => {
  it("hides the fixed title and projects every body coordinate", () => {
    const source = [
      "Root [[Global]]",
      "\t```ts",
      "\t\tconst value = 1;",
      "\t```",
      "\t: Definition",
      "\tMystery",
    ].join("\n");
    const document = parseCtnEditableBody(
      source,
      "2026-07-18 14:35:00",
      defaultCtnSyntaxProfile,
    );

    expect(document.blocks.map((block) => block.lineNumber)).toEqual([
      1, 2, 5, 6,
    ]);
    expect(document.roots).toHaveLength(1);
    expect(document.roots[0]).toBe(document.blocks[0]);
    expect(document.roots[0].children).toEqual([
      document.blocks[1],
      document.blocks[2],
      document.blocks[3],
    ]);
    expect(document.blocks[0]).toMatchObject({
      lexicalEndLineNumber: 1,
      subtreeEndLineNumber: 6,
      text: "Root [[Global]]",
    });
    expect(document.blocks[0].inlineSpans[0]).toMatchObject({
      id: expect.stringMatching(/^1-/),
      lineNumber: 1,
      text: "Global",
      type: "global-reference",
    });
    expect(document.blocks[1]).toMatchObject({
      lexicalEndLineNumber: 4,
      lineNumber: 2,
      multilineRange: {
        closingFenceLineNumber: 4,
        contentEndLineNumber: 3,
        contentStartLineNumber: 3,
        status: "closed",
      },
      subtreeEndLineNumber: 4,
    });
    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: "unknown-syntax",
        id: expect.stringMatching(/^6-/),
        lineNumber: 6,
      }),
    ]);
    expect(document.blocks[3].diagnostics).toEqual(document.diagnostics);
  });

  it("supports an empty body without exposing title diagnostics or blocks", () => {
    expect(
      parseCtnEditableBody(
        "",
        "2026-07-18 14:35:00",
        defaultCtnSyntaxProfile,
      ),
    ).toEqual({ blocks: [], diagnostics: [], roots: [] });
  });

  it("rejects a hidden title that is empty or contains another line", () => {
    expect(() =>
      parseCtnEditableBody("Body", "", defaultCtnSyntaxProfile),
    ).toThrow("one non-empty line");
    expect(() =>
      parseCtnEditableBody(
        "Body",
        "First\nSecond",
        defaultCtnSyntaxProfile,
      ),
    ).toThrow("one non-empty line");
    expect(() =>
      parseCtnEditableBody(
        "Body",
        ": Hidden marker",
        defaultCtnSyntaxProfile,
      ),
    ).toThrow("valid CTN title line");
  });
});
