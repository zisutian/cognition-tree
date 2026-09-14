// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseInlineSpans } from "../../../../../core/ctn/parser/inlineSpans";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax";
import type { CtnInlineRule } from "../../../../../core/ctn/syntax/types";

const style = { label: "Test", textColor: "default", tone: "default" } as const;
const rules: CtnInlineRule[] = [
  { ...style, kind: "paired", open: "[[", close: "]]", semanticId: "reference" },
  { ...style, kind: "paired", open: "[", close: "]]", semanticId: "short-reference" },
  { ...style, kind: "single", marker: "|", semanticId: "choice" },
];

describe("CTN inline spans", () => {
  it("preserves valid references after a long unfinished delimiter sequence", () => {
    const unfinished = "<".repeat(524_288);
    const spans = parseInlineSpans(`${unfinished} [[Target]]`, 2, 3, defaultCtnSyntax.inlineMatcher);

    expect(spans).toEqual([expect.objectContaining({
      lineNumber: 2,
      startColumn: unfinished.length + 4,
      text: "Target",
      rule: expect.objectContaining({ semanticId: "global-reference" }),
    })]);
  });

  it("keeps single markers between paired boundaries and expands only their word", () => {
    const text = "[[left]]x|y[[right]] A|B C|D";
    const spans = parseInlineSpans(text, 1, 1, rules);

    expect(spans.map(({ text }) => text)).toEqual(["left", "x|y", "right", "A|B", "C|D"]);
    expect(spans[1]).toMatchObject({ startColumn: 9, endColumn: 12 });
  });

  it("finds successive closers shared by different openers", () => {
    const spans = parseInlineSpans("[[one]] [two]] [[three]] [[unfinished", 1, 1, rules);

    expect(spans.map(({ text, rule }) => [text, rule.semanticId])).toEqual([
      ["one", "reference"],
      ["two", "short-reference"],
      ["three", "reference"],
    ]);
  });
});
