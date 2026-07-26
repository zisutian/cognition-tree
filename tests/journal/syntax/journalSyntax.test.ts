// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readEditableTestDocument,
} from "../../ctn/analysis/analysisTestHelpers";
import {
  defaultJournalSyntax,
  defaultJournalSyntaxSource,
} from "../../../core/journal/syntax/defaultJournalSyntax";
import {
  compileCtnSyntaxSource,
} from "../../../core/ctn/syntax/compiler";
import { describe, expect, it } from "vitest";

describe("journal CTN syntax", () => {
  it("uses a neutral body rule and the protected reference vocabulary", () => {
    expect(defaultJournalSyntax.name).toBe("日记");
    expect(defaultJournalSyntax.root).toEqual(
      expect.objectContaining({
        label: "正文",
        semanticId: "body",
        textColor: "default",
        tone: "default",
      }),
    );
    expect(
      defaultJournalSyntax.inline.find(
        ({ semanticId }) => semanticId === "global-reference",
      ),
    ).toEqual(expect.objectContaining({
      close: "]]",
      kind: "paired",
      open: "[[",
    }));
  });

  it("parses editable source and rejects changes to protected semantics", () => {
    const document = readEditableTestDocument(
      "2026-07-18-0001\n普通正文\n- [[2026-07-17-0001]]",
      defaultJournalSyntax,
    );

    expect(document.blocks.map(({ rule }) => rule.semanticId)).toEqual([
      "title",
      "body",
      "component",
    ]);
    expect(document.blocks[2]?.inlineSpans).toEqual([
      expect.objectContaining({
        text: "2026-07-17-0001",
        rule: expect.objectContaining({
          semanticId: "global-reference",
        }),
      }),
    ]);
    expect(compileCtnSyntaxSource(
      defaultJournalSyntaxSource.replace('open = "[["', 'open = "{{"'),
      "journal",
    ).syntax).toBeNull();
    expect(compileCtnSyntaxSource(
      defaultJournalSyntaxSource.replace('name = "日记"', 'name = "别名"'),
      "journal",
    ).syntax).toBeNull();
  });
});
