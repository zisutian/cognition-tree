import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../src/ctn/parseOutline";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";

function parseDefaultCtnDocument(source: string) {
  return parseCtnDocument(source, {
    syntaxProfile: defaultCtnSyntaxProfile,
  });
}

describe("parseCtnDocument", () => {
  it("builds a semantic block tree from the default CTN markers", () => {
    const document = parseDefaultCtnDocument(`Root
    : Definition
    > Understanding
        - Component
    \`\`\` ts`);

    expect(document.roots).toHaveLength(1);
    expect(document.blocks).toHaveLength(5);
    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0]).toMatchObject({
      endLineNumber: 5,
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
      endLineNumber: 5,
      label: "代码块",
      lineNumber: 5,
      marker: "```",
      text: "ts",
      type: "code",
    });
  });

  it("computes subtree ranges across roots, children, last blocks, and blank lines", () => {
    const document = parseDefaultCtnDocument(`Root
    : Definition

    - Component
Sibling
    > Understanding`);

    expect(
      document.blocks.map((block) => ({
        endLineNumber: block.endLineNumber,
        lineNumber: block.lineNumber,
        text: block.text,
      })),
    ).toEqual([
      { endLineNumber: 4, lineNumber: 1, text: "Root" },
      { endLineNumber: 3, lineNumber: 2, text: "Definition" },
      { endLineNumber: 4, lineNumber: 4, text: "Component" },
      { endLineNumber: 6, lineNumber: 5, text: "Sibling" },
      { endLineNumber: 6, lineNumber: 6, text: "Understanding" },
    ]);
  });

  it("parses inline structural spans outside code blocks", () => {
    const document = parseDefaultCtnDocument(
      "Root `code` <local> [[global]] A \\ B\n    : `literal <ignored>` <term> [[Topic]] A \\ B\n    - <当前笔记> \\ [[全局概念]]",
    );
    const root = document.roots[0];
    const definition = root.children[0];
    const component = root.children[1];

    expect(root.inlineSpans).toEqual([
      expect.objectContaining({
        endColumn: 12,
        startColumn: 6,
        text: "code",
        type: "inline-code",
      }),
      expect.objectContaining({
        text: "local",
        type: "local-reference",
      }),
      expect.objectContaining({
        text: "global",
        type: "global-reference",
      }),
      expect.objectContaining({
        startColumn: 34,
        text: "\\",
        type: "parallel-separator",
      }),
    ]);
    expect(definition.inlineSpans.map((span) => [span.type, span.text])).toEqual([
      ["inline-code", "literal <ignored>"],
      ["local-reference", "term"],
      ["global-reference", "Topic"],
      ["parallel-separator", "\\"],
    ]);
    expect(component.inlineSpans.map((span) => [span.type, span.text])).toEqual([
      ["local-reference", "当前笔记"],
      ["parallel-separator", "\\"],
      ["global-reference", "全局概念"],
    ]);
  });

  it("treats fenced code block contents as raw block range", () => {
    const document = parseDefaultCtnDocument(`Root
    \`\`\`ts
    : Not a definition
        - Not a component
    \`\`\`
    : After`);

    expect(document.diagnostics).toHaveLength(0);
    expect(document.blocks.map((block) => block.text)).toEqual([
      "Root",
      "ts",
      "After",
    ]);
    expect(document.roots[0].children[0]).toMatchObject({
      children: [],
      endLineNumber: 5,
      inlineSpans: [],
      lineNumber: 2,
      marker: "```",
      type: "code",
    });
    expect(document.roots[0].children[1]).toMatchObject({
      endLineNumber: 6,
      lineNumber: 6,
      text: "After",
      type: "definition",
    });
  });

  it("reports invalid line-start symbols instead of parsing aliases", () => {
    const document = parseDefaultCtnDocument(`# Root
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

  it("reports removed profile markers instead of treating them as concepts", () => {
    const document = parseCtnDocument(`Root
    : Removed definition
    > Removed understanding
    - Removed component
    ! Removed custom marker`, {
      syntaxProfile: {
        ...defaultCtnSyntaxProfile,
        id: "restricted-profile",
        markerRules: [
          { marker: "```", type: "code", label: "代码块" },
        ],
      },
    });

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
    ]);
    expect(document.roots[0].children.map((node) => node.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(document.roots[0].children.map((node) => node.marker)).toEqual([
      ":",
      ">",
      "-",
      "!",
    ]);
  });

  it("preserves raw text and ignores blank lines", () => {
    const document = parseDefaultCtnDocument(`    plain text

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
    const document = parseDefaultCtnDocument(`Root
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
    const document = parseDefaultCtnDocument(`Root
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
