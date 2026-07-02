import { describe, expect, it } from "vitest";
import {
  extractBlockText,
  getBlockLineRange,
  getDocumentAppendLineNumber,
  insertBlockTextBeforeLine,
  removeBlockText,
  rewriteBlockIndent,
} from "../../src/domain/noteBlockText";

describe("note block text operations", () => {
  it("extracts a root block subtree range", () => {
    const source = "Root\n    : Definition\nSibling";

    expect(
      extractBlockText(source, {
        endLineNumber: 2,
        startLineNumber: 1,
      }),
    ).toBe("Root\n    : Definition");
  });

  it("extracts a child block with blank lines inside its range", () => {
    const source = "Root\n    : Definition\n\nSibling";

    expect(
      extractBlockText(source, {
        endLineNumber: 3,
        startLineNumber: 2,
      }),
    ).toBe("    : Definition\n");
  });

  it("removes a final block without leaving an empty document hole", () => {
    const source = "Root\n    : Definition\nSibling";

    expect(
      removeBlockText(source, {
        endLineNumber: 3,
        startLineNumber: 3,
      }),
    ).toBe("Root\n    : Definition");
  });

  it("inserts block text before a target line or at document end", () => {
    expect(insertBlockTextBeforeLine("Root\nSibling", ": Inserted", 2)).toBe(
      "Root\n: Inserted\nSibling",
    );
    expect(insertBlockTextBeforeLine("Root", ": Inserted", 2)).toBe(
      "Root\n: Inserted",
    );
  });

  it("appends before a terminal newline instead of creating a blank hole", () => {
    expect(getDocumentAppendLineNumber("Root\n")).toBe(2);
    expect(insertBlockTextBeforeLine("Root\n", ": Inserted", 2)).toBe(
      "Root\n: Inserted\n",
    );
  });

  it("rewrites indentation by four-space levels", () => {
    expect(
      rewriteBlockIndent("    : Definition\n        - Component", 1, 0),
    ).toBe(": Definition\n    - Component");
    expect(rewriteBlockIndent(": Definition\n    - Component", 0, 1)).toBe(
      "    : Definition\n        - Component",
    );
  });

  it("keeps multiline block contents relative to the moved subtree", () => {
    expect(
      rewriteBlockIndent("    ```ts\n        const value = 1;\n    ```", 1, 0),
    ).toBe("```ts\n    const value = 1;\n```");
  });

  it("derives ranges from parser-shaped blocks and append line numbers", () => {
    expect(getBlockLineRange({ endLineNumber: 4, lineNumber: 2 })).toEqual({
      endLineNumber: 4,
      startLineNumber: 2,
    });
    expect(getDocumentAppendLineNumber("Root\nSibling")).toBe(3);
    expect(getDocumentAppendLineNumber("")).toBe(1);
  });
});
