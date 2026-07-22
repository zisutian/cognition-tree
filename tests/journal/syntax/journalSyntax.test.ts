// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCtnEditableDocument } from "../../../core/ctn/parser/parseCtnDocument";
import {
  defaultJournalCtnSyntaxProfileV3,
  defaultJournalSyntaxSourceV3,
  parseJournalSyntaxSource,
} from "../../../core/journal/syntax/journalSyntax";
import { describe, expect, it } from "vitest";

describe("journal CTN syntax", () => {
  it("uses a neutral body rule and the protected reference vocabulary", () => {
    expect(defaultJournalCtnSyntaxProfileV3.name).toBe("日记");
    expect(defaultJournalCtnSyntaxProfileV3.topLevelUnmarkedRule).toEqual(
      expect.objectContaining({
        label: "正文",
        textColor: "default",
        tone: "default",
        type: "body",
      }),
    );
    expect(
      defaultJournalCtnSyntaxProfileV3.inlineRules.find(
        ({ type }) => type === "global-reference",
      ),
    ).toEqual(expect.objectContaining({
      close: "]]",
      kind: "paired",
      open: "[[",
    }));
  });

  it("parses editable source and rejects changes to protected semantics", () => {
    const document = parseCtnEditableDocument(
      "2026-07-18-0001\n普通正文\n- [[2026-07-17-0001]]",
      defaultJournalCtnSyntaxProfileV3,
    );

    expect(document.blocks.map(({ type }) => type)).toEqual([
      "title",
      "body",
      "component",
    ]);
    expect(document.blocks[2]?.inlineSpans).toEqual([
      expect.objectContaining({
        text: "2026-07-17-0001",
        type: "global-reference",
      }),
    ]);
    expect(parseJournalSyntaxSource(
      defaultJournalSyntaxSourceV3.replace('open = "[["', 'open = "{{"'),
    ).profile).toBeNull();
    expect(parseJournalSyntaxSource(
      defaultJournalSyntaxSourceV3.replace('name = "日记"', 'name = "别名"'),
    ).profile).toBeNull();
  });
});
