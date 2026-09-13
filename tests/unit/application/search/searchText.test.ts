// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { projectSearchDocumentResults } from "../../../../application/search/searchText.ts";

function snippets(text: string, query: string) {
  return projectSearchDocumentResults(
    {
      blocks: [{ blockId: "block", body: null, text, updatedAt: "2026-09-14" }],
      domain: "journal",
      editableText: text,
      resourceId: "entry",
      title: "Entry",
      updatedAt: "2026-09-14",
      version: `sha256:${"a".repeat(64)}`,
    },
    { query },
  ).map(({ snippet }) => snippet);
}

describe("search text projection", () => {
  it("locates context-sensitive lowercase matches in the original source", () => {
    const source = `${"x".repeat(300)} ΟΣ`;
    expect(snippets(source, "ος")).toEqual([`…${"x".repeat(47)} ΟΣ`]);
  });

  it.each([
    ["前缀 aﬃnity 👩🏽‍💻 后缀", "AFFINITY"],
    ["前缀 e\u0301 后缀", "É"],
    ["前缀 İ 后缀", "i\u0307"],
  ])(
    "keeps short source text intact across Unicode normalization: %s",
    (source, query) => {
      expect(snippets(source, query)).toEqual([source]);
    },
  );

  it("keeps combining sequences and emoji whole at both snippet boundaries", () => {
    const source = `${"e\u0301".repeat(120)} needle ${"👩🏽‍💻".repeat(50)}`;
    const [snippet] = snippets(source, "needle");
    expect(snippet).toContain("needle");
    expect(snippet!.startsWith("…e\u0301")).toBe(true);
    expect(snippet!.endsWith("👩🏽‍💻…")).toBe(true);
    expect(source).toContain(snippet!.slice(1, -1));
  });

  it("shows a complete expanded grapheme when a query matches inside its normalized text", () => {
    const source = `${"ﬃ".repeat(80)} needle ${"ﬃ".repeat(80)}`;
    const [snippet] = snippets(source, "i needle f");
    expect(snippet).toContain("ﬃ needle ﬃ");
    expect(source).toContain(snippet!.slice(1, -1));
  });

  it("preserves long matching text instead of truncating the match to the context window", () => {
    const query = "needle".repeat(40);
    expect(snippets(`prefix ${query} suffix`, query)).toEqual([
      `prefix ${query}…`,
    ]);
  });
});
