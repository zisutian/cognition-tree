// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  compileCtnSyntaxDefinition,
  compileCtnSyntaxSource,
  requireCtnSyntax,
} from "../../../core/ctn/syntax/compiler";
import {
  defaultCtnSyntax,
  defaultCtnSyntaxDefinition,
  defaultCtnSyntaxSource,
} from "../../../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../../../core/ctn/syntax/formatter";
import type {
  CtnSyntaxDefinition,
  CtnSyntaxOwner,
} from "../../../core/ctn/syntax/types";
import {
  defaultJournalSyntaxDefinition,
  defaultJournalSyntaxSource,
} from "../../../core/journal/syntax/defaultJournalSyntax";
import {
  defaultTodoSyntaxDefinition,
  defaultTodoSyntaxSource,
} from "../../../core/todo/syntax/defaultTodoSyntax";

function cloneWorkspaceDefinition(): CtnSyntaxDefinition {
  return structuredClone(defaultCtnSyntaxDefinition);
}

function diagnosticCoordinates(source: string, owner: CtnSyntaxOwner) {
  const result = compileCtnSyntaxSource(source, owner);

  expect(result.syntax).toBeNull();
  expect(result.diagnostics.length).toBeGreaterThan(0);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.path).not.toBe("");
    expect(diagnostic.lineNumber).toEqual(expect.any(Number));
    expect(diagnostic.column).toEqual(expect.any(Number));
    expect(diagnostic.lineNumber).toBeGreaterThanOrEqual(1);
    expect(diagnostic.column).toBeGreaterThanOrEqual(1);
  }
  return result.diagnostics;
}

describe("CTN syntax v2 compiler", () => {
  it("decodes the only supported Workspace shape and injects fixed identities", () => {
    const result = compileCtnSyntaxSource(defaultCtnSyntaxSource, "workspace");

    expect(result.diagnostics).toEqual([]);
    expect(result.definition).toEqual(defaultCtnSyntaxDefinition);
    expect(result.syntax).toMatchObject({
      formatVersion: 2,
      name: "默认 CTN 语法",
      owner: "workspace",
      root: {
        kind: "line",
        marker: null,
        semanticId: "concept",
      },
      title: {
        kind: "line",
        marker: null,
        semanticId: "title",
      },
    });
  });

  it.each([
    [
      "workspace",
      defaultCtnSyntaxDefinition,
      defaultCtnSyntaxSource,
    ],
    [
      "journal",
      defaultJournalSyntaxDefinition,
      defaultJournalSyntaxSource,
    ],
    [
      "todo",
      defaultTodoSyntaxDefinition,
      defaultTodoSyntaxSource,
    ],
  ] as const)(
    "formats %s definitions in the canonical field order and round-trips",
    (owner, definition, expectedSource) => {
      const source = formatCtnSyntaxV2(
        structuredClone(definition),
        owner,
      );
      const result = compileCtnSyntaxSource(source, owner);

      expect(source).toBe(expectedSource);
      expect(result.diagnostics).toEqual([]);
      expect(result.definition).toEqual(definition);
      expect(formatCtnSyntaxV2(result.definition!, owner)).toBe(source);
    },
  );

  it.each([
    [
      "missing version",
      defaultCtnSyntaxSource.replace("formatVersion = 2\n", ""),
      "missing-field",
      "$.formatVersion",
    ],
    [
      "non-v2 version",
      defaultCtnSyntaxSource.replace("formatVersion = 2", "formatVersion = 1"),
      "invalid-format-version",
      "$.formatVersion",
    ],
    [
      "v1 markers",
      defaultCtnSyntaxSource.replace("[[blocks]]", "[[markers]]"),
      "forbidden-field",
      "$.markers",
    ],
    [
      "v1 concept",
      defaultCtnSyntaxSource.replace("[root]", "[concept]"),
      "forbidden-field",
      "$.concept",
    ],
    [
      "v1 type alias",
      defaultCtnSyntaxSource.replace(
        'semanticId = "multiline-block"',
        'type = "multiline-block"',
      ),
      "forbidden-field",
      "blocks[0].type",
    ],
    [
      "v1 role alias",
      defaultCtnSyntaxSource.replace(
        'kind = "multiline"',
        'role = "multiline"',
      ),
      "forbidden-field",
      "blocks[0].role",
    ],
    [
      "v1 inlineRules",
      defaultCtnSyntaxSource.replace("[[inline]]", "[[inlineRules]]"),
      "forbidden-field",
      "$.inlineRules",
    ],
  ])("rejects $s without a compatibility path", (_label, source, code, path) => {
    expect(diagnosticCoordinates(source, "workspace")).toContainEqual(
      expect.objectContaining({ code, path }),
    );
  });

  it("rejects unknown fields even when every required field remains valid", () => {
    const source = defaultCtnSyntaxSource
      .replace(
        'name = "默认 CTN 语法"',
        'name = "默认 CTN 语法"\nunsupported = true',
      )
      .replace(
        'label = "代码"',
        'label = "代码"\nunsupportedBlock = "no"',
      );
    const diagnostics = diagnosticCoordinates(source, "workspace");

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-field",
          path: "$.unsupported",
        }),
        expect.objectContaining({
          code: "forbidden-field",
          path: "blocks[0].unsupportedBlock",
        }),
      ]),
    );
  });

  it("strictly separates paired and single inline fields", () => {
    const pairedWithMarker = defaultCtnSyntaxSource.replace(
      'open = "[["',
      'open = "[["\nmarker = "!"',
    );
    const singleWithPair = defaultCtnSyntaxSource.replace(
      'marker = "\\\\"',
      'marker = "\\\\"\nopen = "("\nclose = ")"',
    );

    expect(
      diagnosticCoordinates(pairedWithMarker, "workspace"),
    ).toContainEqual(
      expect.objectContaining({
        code: "forbidden-field",
        path: "inline[0].marker",
      }),
    );
    expect(
      diagnosticCoordinates(singleWithPair, "workspace"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-field",
          path: "inline[3].open",
        }),
        expect.objectContaining({
          code: "forbidden-field",
          path: "inline[3].close",
        }),
      ]),
    );
  });

  it.each([
    ["!", true],
    ["💡", true],
    ["。", true],
    ["!@#$%^&*()[]", true],
    ["", false],
    ["a", false],
    ["1", false],
    ["_", true],
    ["!\t", false],
    ["!\u0001", false],
    ["!!!!!!!!!!!!!", false],
    ["\u0301", false],
  ])("validates token %j by Unicode code point category", (token, valid) => {
    const definition = cloneWorkspaceDefinition();

    definition.blocks[0] = {
      ...definition.blocks[0],
      marker: token,
    };
    const result = compileCtnSyntaxDefinition(definition, "workspace");

    expect(Boolean(result.syntax)).toBe(valid);
    if (!valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "invalid-token",
          path: "blocks[0].marker",
        }),
      );
    }
  });

  it("precompiles prefix-overlapping tokens in longest-match order", () => {
    const definition = cloneWorkspaceDefinition();

    definition.blocks = [
      {
        ...definition.blocks[0],
        label: "短块",
        marker: ">>",
        semanticId: "short-block",
      },
      {
        ...definition.blocks[1],
        label: "长块",
        marker: ">>>",
        semanticId: "long-block",
      },
    ];
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
    ];
    const result = compileCtnSyntaxDefinition(definition, "workspace");

    expect(result.diagnostics).toEqual([]);
    expect(result.syntax?.blockMatcher.map(({ marker }) => marker)).toEqual([
      ">>>",
      ">>",
    ]);
    expect(
      result.syntax?.inlineMatcher.map((rule) =>
        rule.kind === "paired" ? rule.open : rule.marker
      ),
    ).toEqual(["[[[", "[["]);
  });

  it("classifies grammar and presentation changes with stable keys", () => {
    const base = defaultCtnSyntax;
    const presentationDefinition = cloneWorkspaceDefinition();

    presentationDefinition.name = "另一名称";
    presentationDefinition.tabDisplayWidth = 8;
    presentationDefinition.blocks[0] = {
      ...presentationDefinition.blocks[0],
      label: "原文块",
      tone: "pink",
    };
    const presentation = compileCtnSyntaxDefinition(
      presentationDefinition,
      "workspace",
    ).syntax!;
    const inlineDefinition = cloneWorkspaceDefinition();
    const inlineRule = inlineDefinition.inline[1];

    if (inlineRule?.kind !== "paired") {
      throw new Error("Expected the default inline-code rule.");
    }
    inlineDefinition.inline[1] = { ...inlineRule, open: "《", close: "》" };
    const inline = compileCtnSyntaxDefinition(
      inlineDefinition,
      "workspace",
    ).syntax!;
    const blockDefinition = cloneWorkspaceDefinition();

    blockDefinition.blocks[0] = {
      ...blockDefinition.blocks[0],
      marker: "~~~",
    };
    const block = compileCtnSyntaxDefinition(
      blockDefinition,
      "workspace",
    ).syntax!;
    const reorderedDefinition = cloneWorkspaceDefinition();

    reorderedDefinition.blocks.reverse();
    reorderedDefinition.inline.reverse();
    const reordered = compileCtnSyntaxDefinition(
      reorderedDefinition,
      "workspace",
    ).syntax!;

    expect(presentation.blockGrammarKey).toBe(base.blockGrammarKey);
    expect(presentation.inlineGrammarKey).toBe(base.inlineGrammarKey);
    expect(presentation.analysisKey).toBe(base.analysisKey);
    expect(presentation.presentationKey).not.toBe(base.presentationKey);

    expect(inline.blockGrammarKey).toBe(base.blockGrammarKey);
    expect(inline.inlineGrammarKey).not.toBe(base.inlineGrammarKey);

    expect(block.blockGrammarKey).not.toBe(base.blockGrammarKey);
    expect(block.inlineGrammarKey).toBe(base.inlineGrammarKey);

    expect(reordered.blockGrammarKey).toBe(base.blockGrammarKey);
    expect(reordered.inlineGrammarKey).toBe(base.inlineGrammarKey);
    expect(reordered.presentationKey).not.toBe(base.presentationKey);
  });

  it("freezes compiled runtime syntax and rules", () => {
    expect(Object.isFrozen(defaultCtnSyntax)).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.definition)).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.blocks)).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.blocks[0])).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.inline)).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.inline[0])).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.title)).toBe(true);
    expect(Object.isFrozen(defaultCtnSyntax.root)).toBe(true);
  });

  it("reports TOML parser failures with a path and position", () => {
    const result = compileCtnSyntaxSource('formatVersion = 2\nname = "broken', "workspace");

    expect(result).toMatchObject({
      definition: null,
      syntax: null,
      diagnostics: [
        {
          code: "toml-parse-error",
          path: "$",
        },
      ],
    });
    expect(result.diagnostics[0]?.lineNumber).toEqual(expect.any(Number));
    expect(result.diagnostics[0]?.column).toEqual(expect.any(Number));
  });

  it("throws only at the explicit require boundary", () => {
    expect(() => requireCtnSyntax("formatVersion = 1", "workspace"))
      .toThrow(/formatVersion|缺少字段/);
  });
});
