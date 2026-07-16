import { describe, expect, it } from "vitest";
import {
  parseCtnCanonicalDocument,
  parseCtnEditableDocument,
} from "../../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../src/ctn/syntax/types";
import { addTestCtnBlockMetadata } from "../metadata/sourceMetadataFixture";

function parseTestCtnDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
) {
  return parseCtnCanonicalDocument(
    addTestCtnBlockMetadata(source, syntaxProfile),
    syntaxProfile,
  );
}

describe("parseCtnCanonicalDocument", () => {
  it("parses the fixed first line as the document title block", () => {
    const document = parseTestCtnDocument("Document Title\nRoot");

    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0]).toMatchObject({
      subtreeEndLineNumber: 2,
      label: "标题",
      level: 0,
      lineNumber: 2,
      metadataLineNumber: 1,
      marker: null,
      text: "Document Title",
      type: "title",
    });
    expect(document.roots[1]).toMatchObject({
      label: "顶格概念",
      lineNumber: 4,
      metadataLineNumber: 3,
      text: "Root",
      type: "concept",
    });
  });

  it("reports invalid fixed title lines", () => {
    expect(
      parseTestCtnDocument("\nRoot").diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(["title-line-invalid"]);
    expect(
      parseTestCtnDocument("# Root\nRoot").diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(["title-line-invalid"]);
    expect(
      parseTestCtnDocument("\tRoot\nRoot").diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(["title-line-invalid"]);
  });

  it("builds a semantic block tree from the default CTN markers after the title", () => {
    const document = parseTestCtnDocument(`Document Title
Root
	: Definition
	> Understanding
		- Component
	\`\`\` ts
	\`\`\``);
    const root = document.roots[1];

    expect(document.roots).toHaveLength(2);
    expect(document.blocks).toHaveLength(6);
    expect(document.diagnostics).toHaveLength(0);
    expect(root).toMatchObject({
      subtreeEndLineNumber: 13,
      label: "顶格概念",
      level: 0,
      lineNumber: 4,
      marker: null,
      text: "Root",
      type: "concept",
    });
    expect(root.children.map((node) => node.type)).toEqual([
      "definition",
      "personal-understanding",
      "multiline-block",
    ]);
    expect(root.children[1].children[0]).toMatchObject({
      label: "组分",
      level: 2,
      lineNumber: 10,
      marker: "-",
      text: "Component",
      type: "component",
    });
    expect(root.children[2]).toMatchObject({
      lexicalEndLineNumber: 13,
      subtreeEndLineNumber: 13,
      label: "多行块",
      lineNumber: 12,
      marker: "```",
      role: "multiline",
      text: "ts",
      type: "multiline-block",
    });
  });

  it("computes subtree ranges across roots, children, last blocks, and blank lines", () => {
    const document = parseTestCtnDocument(`Document Title
Root
	: Definition

	- Component
Sibling
	> Understanding`);

    expect(
      document.blocks.map((block) => ({
        subtreeEndLineNumber: block.subtreeEndLineNumber,
        lineNumber: block.lineNumber,
        text: block.text,
      })),
    ).toEqual([
      { subtreeEndLineNumber: 2, lineNumber: 2, text: "Document Title" },
      { subtreeEndLineNumber: 9, lineNumber: 4, text: "Root" },
      { subtreeEndLineNumber: 7, lineNumber: 6, text: "Definition" },
      { subtreeEndLineNumber: 9, lineNumber: 9, text: "Component" },
      { subtreeEndLineNumber: 13, lineNumber: 11, text: "Sibling" },
      { subtreeEndLineNumber: 13, lineNumber: 13, text: "Understanding" },
    ]);
  });

  it("parses inline structural spans outside multiline blocks", () => {
    const document = parseTestCtnDocument(
      "Document Title\nRoot `code` <local> [[global]] A \\ B\n\t: `literal <ignored>` <term> [[Topic]] A \\ B\n\t- <当前笔记> \\ [[全局概念]]",
    );
    const root = document.roots[1];
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

  it("treats multiline block contents as raw block range", () => {
    const document = parseTestCtnDocument(`Document Title
Root
	\`\`\`ts
	: Not a definition
		- Not a component
	\`\`\`
	: After`);
    const root = document.roots[1];

    expect(document.diagnostics).toHaveLength(0);
    expect(document.blocks.map((block) => block.text)).toEqual([
      "Document Title",
      "Root",
      "ts",
      "After",
    ]);
    expect(root.children[0]).toMatchObject({
      children: [],
      lexicalEndLineNumber: 9,
      inlineSpans: [],
      lineNumber: 6,
      marker: "```",
      type: "multiline-block",
    });
    expect(root.children[1]).toMatchObject({
      subtreeEndLineNumber: 11,
      lineNumber: 11,
      text: "After",
      type: "definition",
    });
  });

  it("uses exact multiline fences and exposes lexical and content ranges", () => {
    const document = parseTestCtnDocument([
      "Document Title",
      "Root",
      "\t```ts",
      "\tbody",
      "\t\t```",
      "\t``` extra",
      "\t```  ",
      "\t: After",
    ].join("\n"));
    const multiline = document.blocks[2];

    expect(multiline).toMatchObject({
      contentFingerprint: "\t```ts\n\tbody\n\t\t```\n\t``` extra\n\t```  ",
      lexicalEndLineNumber: 10,
      multilineRange: {
        closingFenceLineNumber: 10,
        contentEndLineNumber: 9,
        contentStartLineNumber: 7,
        status: "closed",
      },
      subtreeEndLineNumber: 10,
    });
    expect(document.blocks[3]).toMatchObject({
      lineNumber: 12,
      text: "After",
    });
  });

  it("recovers an unterminated multiline block through EOF", () => {
    const document = parseTestCtnDocument(`Document Title
Root
	\`\`\`ts
	body`);
    const multiline = document.blocks[2];

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unterminated-multiline-block",
    ]);
    expect(multiline).toMatchObject({
      contentFingerprint: "\t```ts\n\tbody",
      lexicalEndLineNumber: 7,
      multilineRange: {
        closingFenceLineNumber: null,
        contentEndLineNumber: 7,
        contentStartLineNumber: 7,
        status: "unterminated",
      },
      subtreeEndLineNumber: 7,
    });
  });

  it("keeps reserved directives visible in editable and canonical documents", () => {
    const editableSource = "Title\n@ctn-block id=broken\nRoot";
    const editable = parseCtnEditableDocument(
      editableSource,
      defaultCtnSyntaxProfile,
    );
    const canonical = parseTestCtnDocument(editableSource);

    expect(editable.blocks.map((block) => block.rawText)).toEqual([
      "Title",
      "@ctn-block id=broken",
      "Root",
    ]);
    expect(editable.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "reserved-directive",
    ]);
    expect(canonical.blocks[1]).toMatchObject({
      rawText: "@ctn-block id=broken",
      text: "@ctn-block id=broken",
      type: "text",
    });
  });

  it("parses the default question rule and reports other invalid symbols", () => {
    const document = parseTestCtnDocument(`Document Title
# Root
	= Definition
	? Question
	+ Action`);
    const root = document.roots[1];

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
    ]);
    expect(root).toMatchObject({
      label: "未知符号",
      level: 0,
      marker: "#",
      text: "Root",
      type: "text",
    });
    expect(root.children.map((node) => node.marker)).toEqual(["=", "?", "+"]);
    expect(root.children[1]).toMatchObject({
      label: "疑问",
      text: "Question",
      textColor: "amber",
      tone: "amber",
      type: "question",
    });
  });

  it("reports removed profile markers instead of treating them as concepts", () => {
    const syntaxProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      markerRules: [
        {
          marker: "```",
          type: "multiline-block",
          label: "多行块",
          role: "multiline" as const,
          textColor: "green" as const,
          tone: "green" as const,
        },
      ],
    };
    const document = parseTestCtnDocument(`Document Title
Root
	: Removed definition
	> Removed understanding
	- Removed component
	! Removed custom marker`, syntaxProfile);
    const root = document.roots[1];

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
      "unknown-marker",
    ]);
    expect(root.children.map((node) => node.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(root.children.map((node) => node.marker)).toEqual([
      ":",
      ">",
      "-",
      "!",
    ]);
  });

  it("preserves raw text and ignores blank lines", () => {
    const document = parseTestCtnDocument(`Document Title
plain text

	: Definition`);

    expect(document.roots).toHaveLength(2);
    expect(document.roots[1]).toMatchObject({
      label: "顶格概念",
      marker: null,
      rawText: "plain text",
      text: "plain text",
    });
    expect(document.roots[1].children[0]).toMatchObject({
      label: "定义",
      lineNumber: 7,
      rawText: "	: Definition",
    });
  });

  it("uses the configured concept tone only for top-level unmarked lines", () => {
    const syntaxProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      conceptRule: {
        label: "顶格概念",
        textColor: "pink",
        tone: "pink",
        type: "concept",
      },
    };
    const document = parseTestCtnDocument(
      "Document Title\nRoot\n\t: Child",
      syntaxProfile,
    );
    const root = document.roots[1];

    expect(document.roots[0]).toMatchObject({
      label: "标题",
      textColor: "cyan",
      tone: "blue",
      type: "title",
    });
    expect(root).toMatchObject({
      label: "顶格概念",
      level: 0,
      marker: null,
      textColor: "pink",
      tone: "pink",
      type: "concept",
    });
    expect(root.children[0]).toMatchObject({
      label: "定义",
      level: 1,
      marker: ":",
      tone: "green",
      type: "definition",
    });
  });

  it("reports indented unmarked lines without concept or inline semantics", () => {
    const document = parseTestCtnDocument(
      "Document Title\nRoot\n\tPlain [[Target]]\n\tAnother child",
    );
    const children = document.roots[1].children;

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-syntax",
      "unknown-syntax",
    ]);
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({
      inlineSpans: [],
      label: "未知语法",
      marker: null,
      text: "Plain [[Target]]",
      type: "text",
    });
    expect(children[1]).toMatchObject({
      inlineSpans: [],
      label: "未知语法",
      marker: null,
      text: "Another child",
      type: "text",
    });
  });

  it("reports indentation and marker diagnostics", () => {
    const document = parseTestCtnDocument(`Document Title
Root
   [未知] Something
Sibling
		: Missing parent`);

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "space-indent",
      "unknown-marker",
      "indent-level-jump",
    ]);
    expect(document.blocks[2].diagnostics).toHaveLength(2);
    expect(document.blocks[4].diagnostics).toHaveLength(1);
  });

  it("treats tabs as one indentation level", () => {
    const document = parseTestCtnDocument(`Document Title
Root
\t> Tab child`);

    expect(document.roots[1].children[0]).toMatchObject({
      label: "理解",
      level: 1,
      text: "Tab child",
      type: "personal-understanding",
    });
  });

  it("accepts custom syntax profiles", () => {
    const syntaxProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      name: "Custom profile",
      tabDisplayWidth: 4,
      markerRules: [
        ...defaultCtnSyntaxProfile.markerRules,
        {
          marker: "!",
          type: "risk",
          label: "重点",
          role: "normal" as const,
          textColor: "red" as const,
          tone: "red" as const,
        },
      ],
    };
    const document = parseTestCtnDocument(
      `Document Title
Root
	! Custom item`,
      syntaxProfile,
    );

    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[1].children[0]).toMatchObject({
      label: "重点",
      level: 1,
      marker: "!",
      text: "Custom item",
      textColor: "red",
      tone: "red",
      type: "risk",
    });
  });

  it("uses role instead of type for multiline block behavior", () => {
    const syntaxProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      markerRules: [
        {
          label: "原文块",
          marker: "~",
          role: "multiline" as const,
          textColor: "green" as const,
          tone: "green" as const,
          type: "snippet",
        },
        {
          label: "风险",
          marker: "!",
          role: "normal" as const,
          textColor: "red" as const,
          tone: "red" as const,
          type: "risk",
        },
      ],
    };
    const document = parseTestCtnDocument(`Document Title
Root
	~ js
	: Raw definition
	~
	! Normal custom`, syntaxProfile);

    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[1].children.map((node) => node.type)).toEqual([
      "snippet",
      "risk",
    ]);
    expect(document.roots[1].children[0]).toMatchObject({
      lexicalEndLineNumber: 8,
      inlineSpans: [],
      role: "multiline",
      text: "js",
    });
  });

  it("reads inline structural spans from the syntax profile", () => {
    const syntaxProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: [
        {
          close: ">>",
          kind: "paired" as const,
          label: "外部引用",
          open: "<<",
          textColor: "violet" as const,
          tone: "violet" as const,
          type: "external-reference",
        },
        {
          kind: "single" as const,
          label: "选择分隔",
          marker: "|",
          textColor: "amber" as const,
          tone: "amber" as const,
          type: "choice-separator",
        },
      ],
    };
    const document = parseTestCtnDocument(
      "Document Title\nRoot <<external>> A | B <ignored>",
      syntaxProfile,
    );

    expect(document.roots[1].inlineSpans.map((span) => [span.type, span.text]))
      .toEqual([
        ["external-reference", "external"],
        ["choice-separator", "|"],
      ]);
  });

  it("expands single inline markers to the surrounding non-space run", () => {
    const document = parseTestCtnDocument(
      "Document Title\nRoot 并列1\\并列2\\并列3 A \\ B C\\D",
    );

    expect(
      document.roots[1].inlineSpans
        .filter((span) => span.type === "parallel-separator")
        .map((span) => span.text),
    ).toEqual(["并列1\\并列2\\并列3", "\\", "C\\D"]);
  });

  it("does not expand single inline markers across paired inline spans", () => {
    const document = parseTestCtnDocument(
      "Document Title\nRoot <当前笔记>\\[[全局概念]]",
    );

    expect(document.roots[1].inlineSpans.map((span) => [span.type, span.text]))
      .toEqual([
        ["local-reference", "当前笔记"],
        ["parallel-separator", "\\"],
        ["global-reference", "全局概念"],
      ]);
  });

  it("keeps leading paired inline syntax in concept text", () => {
    const document = parseTestCtnDocument(
      "Document Title\n<当前笔记>\\[[全局概念]]",
    );

    expect(document.diagnostics).toEqual([]);
    expect(document.roots[1]).toMatchObject({
      marker: null,
      text: "<当前笔记>\\[[全局概念]]",
      type: "concept",
    });
    expect(document.roots[1].inlineSpans.map((span) => [span.type, span.text]))
      .toEqual([
        ["local-reference", "当前笔记"],
        ["parallel-separator", "\\"],
        ["global-reference", "全局概念"],
      ]);
  });
});
