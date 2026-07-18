// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCtnEditableDocument } from "../../../ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import { journalCtnSyntaxProfileV1 } from "../../../journal/syntax/journalSyntaxV1";
import { describe, expect, it } from "vitest";

describe("journal CTN syntax v1", () => {
  it("is an independent frozen profile with journal-owned labels", () => {
    expect(journalCtnSyntaxProfileV1).not.toBe(defaultCtnSyntaxProfile);
    expect(journalCtnSyntaxProfileV1.name).toBe("日记 CTN 语法 v1");
    expect(Object.isFrozen(journalCtnSyntaxProfileV1)).toBe(true);
    expect(Object.isFrozen(journalCtnSyntaxProfileV1.markerRules)).toBe(true);
    expect(Object.isFrozen(journalCtnSyntaxProfileV1.inlineRules)).toBe(true);
    expect(
      journalCtnSyntaxProfileV1.inlineRules.find(
        ({ type }) => type === "global-reference",
      )?.label,
    ).toBe("日记条目引用");
  });

  it("parses the fixed block and inline vocabulary", () => {
    const document = parseCtnEditableDocument(
      "2026-07-18 08:00:00\n- [[2026-07-17 20:00:00]]",
      journalCtnSyntaxProfileV1,
    );

    expect(document.blocks.map(({ type }) => type)).toEqual([
      "title",
      "component",
    ]);
    expect(document.blocks[1]?.inlineSpans).toEqual([
      expect.objectContaining({
        text: "2026-07-17 20:00:00",
        type: "global-reference",
      }),
    ]);
  });
});
