import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../src/ctn/parseOutline";
import {
  createOutlineTextSegments,
  getOutlineDisplayText,
} from "../../src/features/notes/outlineTextSegments";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";

function parseFirstRoot(source: string) {
  const document = parseCtnDocument(source, {
    syntaxProfile: defaultCtnSyntaxProfile,
  });

  return document.roots[0];
}

describe("outline text segments", () => {
  it("hides paired inline syntax and underlines the parsed content", () => {
    const root = parseFirstRoot("主题 [[全局概念]] 和 `code`");

    expect(createOutlineTextSegments(root)).toEqual([
      { id: "block-1-text-0", kind: "text", text: "主题 " },
      {
        id: "1-4-global-reference",
        kind: "inline",
        text: "全局概念",
        tone: "blue",
      },
      { id: "block-1-text-11", kind: "text", text: " 和 " },
      {
        id: "1-15-inline-code",
        kind: "inline",
        text: "code",
        tone: "code",
      },
    ]);
    expect(getOutlineDisplayText(root)).toBe("主题 全局概念 和 code");
  });

  it("keeps single inline syntax visible as the underlined content", () => {
    const root = parseFirstRoot("甲 \\ 乙");

    expect(createOutlineTextSegments(root)).toEqual([
      { id: "block-1-text-0", kind: "text", text: "甲 " },
      {
        id: "1-3-parallel-separator",
        kind: "inline",
        text: "\\",
        tone: "amber",
      },
      { id: "block-1-text-3", kind: "text", text: " 乙" },
    ]);
  });
});
