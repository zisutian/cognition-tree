import { describe, expect, it } from "vitest";
import {
  defaultCtnSyntaxProfile,
  parseCtnDocument,
} from "../../src/ctn/parseOutline";

describe("parseCtnDocument", () => {
  it("builds a semantic block tree from the default CTN markers", () => {
    const document = parseCtnDocument(`Root
    : Definition
    > Understanding
        - Component
    [语法] Rule
    \`\`\` ts`);

    expect(document.roots).toHaveLength(1);
    expect(document.blocks).toHaveLength(6);
    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0]).toMatchObject({
      label: "概念",
      level: 0,
      lineNumber: 1,
      marker: null,
      text: "Root",
      type: "concept",
    });
    expect(document.roots[0].children.map((node) => node.type)).toEqual([
      "definition",
      "personal-understanding",
      "syntax-rule",
      "code",
    ]);
    expect(document.roots[0].children[1].children[0]).toMatchObject({
      label: "组分",
      level: 2,
      lineNumber: 4,
      marker: "-",
      text: "Component",
      type: "component",
    });
    expect(document.roots[0].children[2]).toMatchObject({
      label: "语法",
      lineNumber: 5,
      marker: "[语法]",
      text: "Rule",
      type: "syntax-rule",
    });
    expect(document.roots[0].children[3]).toMatchObject({
      label: "代码块",
      lineNumber: 6,
      marker: "```",
      text: "ts",
      type: "code",
    });
  });

  it("reports invalid line-start symbols instead of parsing aliases", () => {
    const document = parseCtnDocument(`# Root
    = Definition
    ? Question
    + Action`);

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
    ]);
    expect(document.roots[0]).toMatchObject({
      label: "未知符号",
      level: 0,
      marker: "#",
      text: "Root",
      type: "text",
    });
    expect(document.roots[0].children.map((node) => node.marker)).toEqual([
      "=",
      "?",
      "+",
    ]);
  });

  it("preserves raw text and ignores blank lines", () => {
    const document = parseCtnDocument(`    plain text

    : Definition`);

    expect(document.roots).toHaveLength(2);
    expect(document.roots[0]).toMatchObject({
      label: "概念",
      marker: null,
      rawText: "    plain text",
      text: "plain text",
    });
    expect(document.roots[1]).toMatchObject({
      label: "定义",
      lineNumber: 3,
      rawText: "    : Definition",
    });
  });

  it("reports indentation and marker diagnostics", () => {
    const document = parseCtnDocument(`Root
   [未知] Something
Sibling
        : Missing parent`);

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "indent-not-multiple",
      "unknown-marker",
      "indent-level-jump",
    ]);
    expect(document.blocks[1].diagnostics).toHaveLength(2);
    expect(document.blocks[3].diagnostics).toHaveLength(1);
  });

  it("treats tabs as one indentation level", () => {
    const document = parseCtnDocument(`Root
\t> Tab child`);

    expect(document.roots[0].children[0]).toMatchObject({
      label: "理解",
      level: 1,
      text: "Tab child",
      type: "personal-understanding",
    });
  });

  it("accepts custom syntax profiles", () => {
    const document = parseCtnDocument(
      `Root
    ! Custom item`,
      {
        syntaxProfile: {
          ...defaultCtnSyntaxProfile,
          id: "custom-profile",
          name: "Custom profile",
          spaceIndentUnit: 4,
          markerRules: [
            ...defaultCtnSyntaxProfile.markerRules,
            { marker: "!", type: "component", label: "重点" },
          ],
        },
      },
    );

    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0].children[0]).toMatchObject({
      label: "重点",
      level: 1,
      marker: "!",
      text: "Custom item",
      type: "component",
    });
  });
});
