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
        textColor: "cyan",
        tone: "blue",
      },
      { id: "block-1-text-11", kind: "text", text: " 和 " },
      {
        id: "1-15-inline-code",
        kind: "inline",
        text: "code",
        textColor: "green",
        tone: "green",
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
        textColor: "amber",
        tone: "amber",
      },
      { id: "block-1-text-3", kind: "text", text: " 乙" },
    ]);
  });

  it("underlines compact parallel groups as one inline segment", () => {
    const root = parseFirstRoot("并列1\\并列2\\并列3 和 甲 \\ 乙");

    expect(createOutlineTextSegments(root)).toEqual([
      {
        id: "1-1-parallel-separator",
        kind: "inline",
        text: "并列1\\并列2\\并列3",
        textColor: "amber",
        tone: "amber",
      },
      { id: "block-1-text-11", kind: "text", text: " 和 甲 " },
      {
        id: "1-17-parallel-separator",
        kind: "inline",
        text: "\\",
        textColor: "amber",
        tone: "amber",
      },
      { id: "block-1-text-17", kind: "text", text: " 乙" },
    ]);
  });

  it("keeps paired references separate from adjacent parallel separators", () => {
    const root = parseFirstRoot("<当前笔记>\\[[全局概念]]");

    expect(createOutlineTextSegments(root)).toEqual([
      {
        id: "1-1-local-reference",
        kind: "inline",
        text: "当前笔记",
        textColor: "teal",
        tone: "teal",
      },
      {
        id: "1-7-parallel-separator",
        kind: "inline",
        text: "\\",
        textColor: "amber",
        tone: "amber",
      },
      {
        id: "1-8-global-reference",
        kind: "inline",
        text: "全局概念",
        textColor: "cyan",
        tone: "blue",
      },
    ]);
    expect(getOutlineDisplayText(root)).toBe("当前笔记\\全局概念");
  });
});
