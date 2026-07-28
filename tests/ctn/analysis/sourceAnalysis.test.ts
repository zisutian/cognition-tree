// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
} from "../../../core/ctn/analysis/sourceAnalysis";
import {
  compileCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/compiler";
import {
  defaultCtnSyntax,
  defaultCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/defaultSyntax";
import type {
  CtnCompiledSyntax,
  CtnSyntaxDefinition,
} from "../../../core/ctn/syntax/types";
import {
  addTestCtnBlockMetadata,
} from "../metadata/sourceMetadataFixture";

function compileWorkspace(
  update: (definition: CtnSyntaxDefinition) => void,
) {
  const definition = structuredClone(defaultCtnSyntaxDefinition);

  update(definition);
  const result = compileCtnSyntaxDefinition(definition, "workspace");
  if (!result.syntax) {
    throw new Error(result.diagnostics[0]?.message ?? "Invalid test syntax.");
  }
  return result.syntax;
}

function analyzeCanonical(
  editableSource: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  const source = addTestCtnBlockMetadata(editableSource, syntax);

  return analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source,
    syntax,
  });
}

function analyzeEditable(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return analyzeCtnSource({
    mode: { kind: "editable-document" },
    source,
    syntax,
  });
}

describe("CTN source analysis", () => {
  it("builds canonical title/root/block trees with resolved rules", () => {
    const analysis = analyzeCanonical(`Document Title
Root
	:Definition
	> Understanding
		- Component
	\`\`\`ts
		opaque
	\`\`\``);
    const { document } = analysis;
    const root = document.roots[1];

    expect(document.diagnostics).toEqual([]);
    expect(document.blocks).toHaveLength(6);
    expect(document.roots[0]).toMatchObject({
      lineNumber: 2,
      metadataLineNumber: 1,
      marker: null,
      rule: {
        label: "标题",
        semanticId: "title",
      },
      text: "Document Title",
    });
    expect(root).toMatchObject({
      marker: null,
      rule: {
        label: "顶格概念",
        semanticId: "concept",
      },
      text: "Root",
    });
    expect(root.children.map(({ rule }) => rule.semanticId)).toEqual([
      "definition",
      "personal-understanding",
      "multiline-block",
    ]);
    expect(root.children[1].children[0]).toMatchObject({
      level: 2,
      marker: "-",
      rule: { label: "组分", semanticId: "component" },
      text: "Component",
    });
    expect(root.children[2]).toMatchObject({
      children: [],
      rule: {
        kind: "multiline",
        label: "代码",
        semanticId: "multiline-block",
      },
      text: "ts",
    });
  });

  it("keeps canonical and editable projections in one analysis", () => {
    const analysis = analyzeCanonical([
      "Title",
      "Root [[Target]]",
      "\t```ts",
      "\t\tconst value = 1",
      "\t```",
      "\t: After",
    ].join("\n"));
    const projection = analysis.editableProjection;

    expect(projection.source).toBe([
      "Title",
      "Root [[Target]]",
      "\t```ts",
      "\t\tconst value = 1",
      "\t```",
      "\t: After",
    ].join("\n"));
    expect(projection.sourceText.values).toEqual(projection.source.split("\n"));
    expect(projection.lineCount).toBe(6);
    expect(projection.document.blocks.map(({ lineNumber }) => lineNumber))
      .toEqual([1, 2, 3, 6]);
    expect(projection.document.roots[1].children).toEqual([
      projection.document.blocks[2],
      projection.document.blocks[3],
    ]);
    expect(projection.document.blocks[1].inlineSpans[0]).toMatchObject({
      id: expect.stringMatching(/^2-/),
      lineNumber: 2,
      rule: { semanticId: "global-reference" },
      text: "Target",
    });
    expect(projection.document.blocks[2]).toMatchObject({
      lexicalEndLineNumber: 5,
      multilineRange: {
        closingFenceLineNumber: 5,
        contentEndLineNumber: 4,
        contentStartLineNumber: 4,
        status: "closed",
      },
    });
  });

  it("parses body mode with virtual title context and native body coordinates", () => {
    const source = [
      "Root [[Global]]",
      "\t```ts",
      "\t\tconst value = 1;",
      "\t```",
      "\t: Definition",
      "\tMystery",
    ].join("\n");
    const analysis = analyzeCtnSource({
      mode: { kind: "body", title: "2026-07-18-0001" },
      source,
      syntax: defaultCtnSyntax,
    });

    expect(analysis.sourceText.source).toBe(source);
    expect(analysis.document.blocks.map(({ lineNumber }) => lineNumber))
      .toEqual([1, 2, 5, 6]);
    expect(analysis.document.roots).toEqual([analysis.document.blocks[0]]);
    expect(analysis.document.blocks[0].children).toEqual([
      analysis.document.blocks[1],
      analysis.document.blocks[2],
      analysis.document.blocks[3],
    ]);
    expect(analysis.document.blocks[1]).toMatchObject({
      lexicalEndLineNumber: 4,
      multilineRange: {
        closingFenceLineNumber: 4,
        contentEndLineNumber: 3,
        contentStartLineNumber: 3,
      },
    });
    expect(analysis.document.diagnostics).toEqual([
      expect.objectContaining({
        code: "unknown-syntax",
        id: expect.stringMatching(/^6-/),
        lineNumber: 6,
      }),
    ]);
  });

  it("supports an empty body and validates the virtual title", () => {
    expect(
      analyzeCtnSource({
        mode: { kind: "body", title: "Hidden Title" },
        source: "",
        syntax: defaultCtnSyntax,
      }).document,
    ).toEqual({ blocks: [], diagnostics: [], roots: [] });
    expect(() =>
      analyzeCtnSource({
        mode: { kind: "body", title: "" },
        source: "Body",
        syntax: defaultCtnSyntax,
      })
    ).toThrow("one non-empty line");
    expect(() =>
      analyzeCtnSource({
        mode: { kind: "body", title: "First\nSecond" },
        source: "Body",
        syntax: defaultCtnSyntax,
      })
    ).toThrow("one non-empty line");
    expect(() =>
      analyzeCtnSource({
        mode: { kind: "body", title: ": Hidden marker" },
        source: "Body",
        syntax: defaultCtnSyntax,
      })
    ).toThrow("valid CTN title line");
  });

  it("matches configured block tokens without requiring whitespace", () => {
    const syntax = compileWorkspace((definition) => {
      definition.blocks = [
        {
          kind: "line",
          label: "短规则",
          marker: ">>",
          semanticId: "short",
          textColor: "blue",
          tone: "blue",
        },
        {
          kind: "line",
          label: "长规则",
          marker: ">>>",
          semanticId: "long",
          textColor: "red",
          tone: "red",
        },
      ];
    });
    const document = analyzeEditable(
      "Title\nRoot\n\t>>>content\n\t>> other",
      syntax,
    ).document;

    expect(document.blocks.slice(2).map((block) => ({
      marker: block.marker,
      semanticId: block.rule.semanticId,
      text: block.text,
    }))).toEqual([
      { marker: ">>>", semanticId: "long", text: "content" },
      { marker: ">>", semanticId: "short", text: "other" },
    ]);
  });

  it("matches inline rules left-to-right without overlap and prefers the longest opener", () => {
    const syntax = compileWorkspace((definition) => {
      definition.inline = [
        {
          close: "]]",
          kind: "paired",
          label: "短引用",
          open: "[[",
          semanticId: "global-reference",
          textColor: "cyan",
          tone: "blue",
        },
        {
          close: "]]]",
          kind: "paired",
          label: "长引用",
          open: "[[[",
          semanticId: "long-reference",
          textColor: "teal",
          tone: "teal",
        },
        {
          kind: "single",
          label: "分隔",
          marker: "|",
          semanticId: "separator",
          textColor: "amber",
          tone: "amber",
        },
      ];
    });
    const root = analyzeEditable(
      "Title\nRoot [[[long]]] [[first]]tail]] A|B C | D",
      syntax,
    ).document.roots[1];

    expect(root.inlineSpans.map((span) => ({
      semanticId: span.rule.semanticId,
      text: span.text,
    }))).toEqual([
      { semanticId: "long-reference", text: "long" },
      { semanticId: "global-reference", text: "first" },
      { semanticId: "separator", text: "A|B" },
      { semanticId: "separator", text: "|" },
    ]);
  });

  it("uses the first corresponding closer without nesting or escaping", () => {
    const root = analyzeEditable(
      "Title\nRoot [[outer [[inner]] tail]]",
    ).document.roots[1];

    expect(root.inlineSpans).toEqual([
      expect.objectContaining({
        rule: expect.objectContaining({ semanticId: "global-reference" }),
        text: "outer [[inner",
      }),
    ]);
  });

  it("recognizes only same-indent same-token whitespace-only multiline closers", () => {
    const source = [
      "Title",
      "Root",
      "\t```ts",
      "\t\t```",
      "\t``` extra",
      "\t````",
      "\t```  ",
      "\t: After",
    ].join("\n");
    const analysis = analyzeEditable(source);
    const multiline = analysis.document.blocks[2];

    expect(multiline).toMatchObject({
      contentFingerprint: [
        "\t```ts",
        "\t\t```",
        "\t``` extra",
        "\t````",
        "\t```  ",
      ].join("\n"),
      lexicalEndLineNumber: 7,
      multilineRange: {
        closingFenceLineNumber: 7,
        contentEndLineNumber: 6,
        contentStartLineNumber: 4,
        status: "closed",
      },
    });
    expect(analysis.document.blocks[3]).toMatchObject({
      lineNumber: 8,
      rule: { semanticId: "definition" },
    });
  });

  it("keeps unterminated multiline source unprojected and diagnosed", () => {
    const source = "Title\n```ts\n\tvalue";
    const analysis = analyzeEditable(source);
    const multiline = analysis.document.blocks[1];

    expect(analysis.document.diagnostics.map(({ code }) => code)).toEqual([
      "unterminated-multiline-block",
    ]);
    expect(multiline).toMatchObject({
      lexicalEndLineNumber: 3,
      multilineRange: {
        closingFenceLineNumber: null,
        contentEndLineNumber: 3,
        contentStartLineNumber: 3,
        status: "unterminated",
      },
    });
  });

  it("keeps custom multiline rules as ordinary editable source facts", () => {
    const syntax = compileWorkspace((definition) => {
      definition.blocks[0] = {
        ...definition.blocks[0],
        label: "原文块",
        marker: "~~~",
        semanticId: "source-block",
      };
    });
    const source = "Title\n\t~~~origin\n\t\tquoted\n\t~~~\n\t: After";
    const analysis = analyzeEditable(source, syntax);

    expect(analysis.document.blocks[1]).toMatchObject({
      indentText: "\t",
      lexicalEndLineNumber: 4,
      lineNumber: 2,
      multilineRange: {
        closingFenceLineNumber: 4,
        contentEndLineNumber: 3,
        contentStartLineNumber: 3,
        status: "closed",
      },
      rawText: "\t~~~origin",
      rule: { label: "原文块", semanticId: "source-block" },
    });
  });

  it("reports title, indentation, unknown syntax, marker, and reserved directives", () => {
    const analysis = analyzeEditable([
      ": Invalid title",
      "Root",
      "   [unknown] Something",
      "\tPlain [[ignored]]",
      "@ctn-block id=broken",
    ].join("\n"));

    expect(analysis.document.diagnostics.map(({ code }) => code)).toEqual([
      "title-line-invalid",
      "space-indent",
      "unknown-marker",
      "unknown-syntax",
      "reserved-directive",
    ]);
    expect(analysis.document.blocks[3]).toMatchObject({
      inlineSpans: [],
      rule: { label: "未知语法", semanticId: "text" },
    });
    expect(analysis.document.blocks[4]).toMatchObject({
      rawText: "@ctn-block id=broken",
      rule: { label: "保留指令", semanticId: "text" },
    });
  });

  it("refreshes labels/colors/rule references without rescanning source facts", () => {
    const analysis = analyzeEditable(
      "Title\nRoot\n\t```language\n\t\tbody\n\t```",
    );
    const syntax = compileWorkspace((definition) => {
      definition.name = "Presentation";
      definition.tabDisplayWidth = 8;
      definition.blocks[0] = {
        ...definition.blocks[0],
        label: "原文块",
        textColor: "red",
        tone: "pink",
      };
    });
    const projected = reprojectCtnAnalysisPresentation(analysis, syntax);

    expect(projected).not.toBe(analysis);
    expect(projected.sourceText).toBe(analysis.sourceText);
    expect(projected.document.blocks[2].rule).toBe(syntax.blocks[0]);
    expect(projected.document.blocks[2].rule).toMatchObject({
      label: "原文块",
      textColor: "red",
      tone: "pink",
    });
    expect(projected.document.blocks[2].multilineRange).toBe(
      analysis.document.blocks[2].multilineRange,
    );
  });

  it("rejects presentation projection across a grammar change", () => {
    const analysis = analyzeEditable("Title\nRoot");
    const syntax = compileWorkspace((definition) => {
      definition.blocks[0] = { ...definition.blocks[0], marker: "~~~" };
    });

    expect(() => reprojectCtnAnalysisPresentation(analysis, syntax))
      .toThrow("identical grammars");
  });
});
