import { describe, expect, it } from "vitest";
import { createMyersTextEdits } from "../../../ctn/metadata/myersTextEdits";
import { reconcileCtnSourceBlockMetadata } from "../../../ctn/metadata/reconcileSourceMetadata";
import { initializeCtnSourceBlockMetadata } from "../../../ctn/metadata/sourceMetadata";
import { applyCtnTextEdits } from "../../../ctn/metadata/textEdits";
import { parseCtnCanonicalDocument } from "../../../ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";

function expectValidEdits(
  previousSource: string,
  nextSource: string,
) {
  const edits = createMyersTextEdits(previousSource, nextSource);

  expect(applyCtnTextEdits(previousSource, edits)).toBe(nextSource);
  edits.forEach((edit, index) => {
    expect(edit.from).toBeLessThanOrEqual(edit.to);
    if (index > 0) {
      expect(edits[index - 1]?.to).toBeLessThanOrEqual(edit.from);
    }
  });
  return edits;
}

describe("createMyersTextEdits", () => {
  it("returns no edits for identical text", () => {
    expect(createMyersTextEdits("same\n正文", "same\n正文")).toEqual([]);
  });

  it.each([
    ["abc", "abXc", [{ from: 2, insertedText: "X", to: 2 }]],
    ["abc", "ac", [{ from: 1, insertedText: "", to: 2 }]],
    ["abc", "aXc", [{ from: 1, insertedText: "X", to: 2 }]],
  ])("represents insertion, deletion, and replacement", (
    previousSource,
    nextSource,
    expected,
  ) => {
    expect(createMyersTextEdits(previousSource, nextSource)).toEqual(expected);
  });

  it("keeps separated changes as ordered previous-source ranges", () => {
    expect(
      expectValidEdits("one two three", "one TWO three!"),
    ).toEqual([
      { from: 4, insertedText: "TWO", to: 7 },
      { from: 13, insertedText: "!", to: 13 },
    ]);
  });

  it("uses a deterministic path when equal lines repeat", () => {
    const previousSource = "A\nrepeat\nrepeat\nZ";
    const nextSource = "A\nrepeat\nchanged\nrepeat\nZ";
    const first = createMyersTextEdits(previousSource, nextSource);

    expect(first).toEqual([
      { from: 9, insertedText: "changed\n", to: 9 },
    ]);
    expect(createMyersTextEdits(previousSource, nextSource)).toEqual(first);
  });

  it("reports UTF-16 offsets across CRLF and non-ASCII text", () => {
    expect(expectValidEdits("甲\r\n乙", "甲\n新乙")).toEqual([
      { from: 1, insertedText: "", to: 2 },
      { from: 3, insertedText: "新", to: 3 },
    ]);
    expect(expectValidEdits("A😀B", "A🐈中文B")).toEqual([
      { from: 1, insertedText: "🐈中文", to: 3 },
    ]);
  });

  it("bounds a large unanchored line and still refines a small middle", () => {
    const size = 2 * 1_024 * 1_024;
    const previousUnanchored = "a".repeat(size);
    const nextUnanchored = "b".repeat(size);

    expect(
      expectValidEdits(previousUnanchored, nextUnanchored),
    ).toEqual([{
      from: 0,
      insertedText: nextUnanchored,
      to: previousUnanchored.length,
    }]);

    const sharedPrefix = "前".repeat(size);
    const sharedSuffix = "后".repeat(size);

    expect(
      expectValidEdits(
        `${sharedPrefix}😀${sharedSuffix}`,
        `${sharedPrefix}🐈${sharedSuffix}`,
      ),
    ).toEqual([{
      from: sharedPrefix.length,
      insertedText: "🐈",
      to: sharedPrefix.length + 2,
    }]);
  });

  it("preserves untouched canonical block identity through reconcile", () => {
    let nextId = 0;
    const createId = () =>
      `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
    const previousEditableSource = "Title\n\t- alpha\n\t- beta";
    const previousCanonicalSource = initializeCtnSourceBlockMetadata(
      previousEditableSource,
      defaultCtnSyntaxProfile,
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        createId,
        reservedIds: new Set(),
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    const nextEditableSource = "Title\n\t- alpha changed\n\t- beta";
    const edits = createMyersTextEdits(
      previousEditableSource,
      nextEditableSource,
    );
    const previousDocument = parseCtnCanonicalDocument(
      previousCanonicalSource,
      defaultCtnSyntaxProfile,
    );
    const nextCanonicalSource = reconcileCtnSourceBlockMetadata(
      previousCanonicalSource,
      { edits, source: nextEditableSource },
      defaultCtnSyntaxProfile,
      {
        createId,
        reservedIds: new Set(),
        timestamp: "2026-01-02T00:00:00.000Z",
      },
    );
    const nextDocument = parseCtnCanonicalDocument(
      nextCanonicalSource,
      defaultCtnSyntaxProfile,
    );

    expect(nextDocument.blocks[2]?.id).toBe(previousDocument.blocks[2]?.id);
    expect(nextDocument.blocks[2]?.metadata.updatedAt).toBe(
      previousDocument.blocks[2]?.metadata.updatedAt,
    );
  });
});
