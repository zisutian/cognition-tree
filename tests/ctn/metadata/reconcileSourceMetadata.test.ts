import { describe, expect, it } from "vitest";
import { createCtnEditableSource } from "../../../ctn/metadata/editableSource";
import {
  recanonicalizeCtnSourceBlockMetadata,
  reconcileCtnSourceBlockMetadata,
} from "../../../ctn/metadata/reconcileSourceMetadata";
import type { CtnEditableSourceChange } from "../../../ctn/metadata/textEdits";
import { parseCtnCanonicalDocument } from "../../../ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
  stripTestCtnBlockMetadata,
  testBlockTimestamp,
} from "./sourceMetadataFixture";

const changedTimestamp = "2026-07-15T01:00:00.000Z";
const questionMultilineSyntaxProfile: CtnSyntaxProfile = {
  ...defaultCtnSyntaxProfile,
  markerRules: defaultCtnSyntaxProfile.markerRules.map((rule) =>
    rule.marker === "?" ? { ...rule, role: "multiline" } : rule
  ),
};

function createIdFactory(offset = 100) {
  let value = offset;
  return () => createTestBlockId(++value);
}

function createReplacementChange(
  previousSource: string,
  source: string,
): CtnEditableSourceChange {
  let prefixLength = 0;

  while (
    prefixLength < previousSource.length &&
    prefixLength < source.length &&
    previousSource[prefixLength] === source[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < previousSource.length - prefixLength &&
    suffixLength < source.length - prefixLength &&
    previousSource[previousSource.length - suffixLength - 1] ===
      source[source.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  return {
    edits: [
      {
        from: prefixLength,
        insertedText: source.slice(prefixLength, source.length - suffixLength),
        to: previousSource.length - suffixLength,
      },
    ],
    source,
  };
}

function reconcile(
  previousSource: string,
  nextEditableSource: string,
  change?: CtnEditableSourceChange,
) {
  const previousEditableSource = createCtnEditableSource(
    previousSource,
    defaultCtnSyntaxProfile,
  ).source;

  return reconcileCtnSourceBlockMetadata(
    previousSource,
    change ?? createReplacementChange(previousEditableSource, nextEditableSource),
    defaultCtnSyntaxProfile,
    {
      createId: createIdFactory(),
      reservedIds: new Set(),
      timestamp: changedTimestamp,
    },
  );
}

function parse(source: string) {
  return parseCtnCanonicalDocument(source, defaultCtnSyntaxProfile);
}

describe("reconcileCtnSourceBlockMetadata", () => {
  it("preserves stable ids and updates the title plus the directly edited block", () => {
    const previousSource = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Child",
    );
    const result = parse(reconcile(previousSource, "Title\nRoot\n\t: Changed"));

    expect(result.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(3),
    ]);
    expect(result.blocks.map((block) => block.metadata.updatedAt)).toEqual([
      changedTimestamp,
      testBlockTimestamp,
      changedTimestamp,
    ]);
  });

  it("creates metadata for a newly typed block and updates changed sibling positions", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot");
    const resultSource = reconcile(previousSource, "Title\nSibling\nRoot");
    const result = parse(resultSource);

    expect(stripTestCtnBlockMetadata(resultSource)).toBe(
      "Title\nSibling\nRoot",
    );
    expect(result.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(101),
      createTestBlockId(2),
    ]);
    expect(result.blocks[2].metadata.updatedAt).toBe(changedTimestamp);
  });

  it("realigns metadata indentation and updates the indented block", () => {
    const previousSource = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Child\nSibling",
    );
    const resultSource = reconcile(
      previousSource,
      "Title\nRoot\n\t\t: Child\nSibling",
    );
    const result = parse(resultSource);

    expect(result.blocks[2]).toMatchObject({
      id: createTestBlockId(3),
      indentText: "\t\t",
      metadata: { updatedAt: changedTimestamp },
    });
    expect(resultSource).toContain(
      `\t\t@ctn-block id=${createTestBlockId(3)}`,
    );
  });

  it("keeps reserved-looking text visible and assigns it ordinary metadata", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot");
    const editableSource = [
      "Title",
      "Root",
      "@ctn-block id=missing-fields",
    ].join("\n");
    const resultSource = reconcile(previousSource, editableSource);
    const result = parse(resultSource);

    expect(stripTestCtnBlockMetadata(resultSource)).toBe(editableSource);
    expect(result.blocks[2]).toMatchObject({
      id: createTestBlockId(101),
      rawText: "@ctn-block id=missing-fields",
    });
    expect(result.blocks[2].diagnostics.map((diagnostic) => diagnostic.code))
      .toEqual(["reserved-directive"]);
  });

  it("includes multiline body text in change detection", () => {
    const previousSource = addTestCtnBlockMetadata(
      "Title\nRoot\n\t```ts\n\tconst value = 1;\n\t```",
    );
    const result = parse(reconcile(
      previousSource,
      "Title\nRoot\n\t```ts\n\tconst value = 2;\n\t```",
    ));

    expect(result.blocks[2]).toMatchObject({
      id: createTestBlockId(3),
      metadata: { updatedAt: changedTimestamp },
    });
  });

  it("keeps the anchored identity on split and the first anchor on merge", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nAlpha\nBeta");
    const split = parse(reconcile(previousSource, "Title\nAl\npha\nBeta"));
    const merged = parse(reconcile(previousSource, "Title\nAlphaBeta"));

    expect(split.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(101),
      createTestBlockId(3),
    ]);
    expect(merged.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
    ]);
  });

  it("treats a manual cut and paste as deletion plus a new block", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nAlpha\nBeta");
    const previousEditable = "Title\nAlpha\nBeta";
    const nextEditable = "Title\nBeta\nAlpha";
    const result = parse(reconcile(previousSource, nextEditable, {
      edits: [
        { from: 6, insertedText: "", to: 12 },
        { from: previousEditable.length, insertedText: "\nAlpha", to: previousEditable.length },
      ],
      source: nextEditable,
    }));

    expect(result.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(3),
      createTestBlockId(101),
    ]);
  });

  it("merges normal blocks into a multiline block using the first surviving anchor", () => {
    const editableSource = "Title\nRoot\n\t? Open\n\tBody\n\t?";
    const previousSource = addTestCtnBlockMetadata(
      editableSource,
      defaultCtnSyntaxProfile,
    );
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousSource,
      defaultCtnSyntaxProfile,
      questionMultilineSyntaxProfile,
      {
        allocateId: createIdFactory(),
        timestamp: changedTimestamp,
      },
    );
    const document = parseCtnCanonicalDocument(
      canonicalSource,
      questionMultilineSyntaxProfile,
    );

    expect(createCtnEditableSource(
      canonicalSource,
      questionMultilineSyntaxProfile,
    ).source).toBe(editableSource);
    expect(document.blocks.map(({ id }) => id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(3),
    ]);
    expect(document.blocks.map(({ metadata }) => metadata)).toEqual([
      { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
      { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
      { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
    ]);
  });

  it("splits a multiline block and allocates identities only for new anchors", () => {
    const editableSource = "Title\nRoot\n\t? Open\n\tBody\n\t?";
    const previousSource = addTestCtnBlockMetadata(
      editableSource,
      questionMultilineSyntaxProfile,
    );
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousSource,
      questionMultilineSyntaxProfile,
      defaultCtnSyntaxProfile,
      {
        allocateId: createIdFactory(),
        timestamp: changedTimestamp,
      },
    );
    const document = parseCtnCanonicalDocument(
      canonicalSource,
      defaultCtnSyntaxProfile,
    );

    expect(createCtnEditableSource(
      canonicalSource,
      defaultCtnSyntaxProfile,
    ).source).toBe(editableSource);
    expect(document.blocks.map(({ id }) => id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(3),
      createTestBlockId(101),
      createTestBlockId(102),
    ]);
    expect(document.blocks.slice(0, 3).map(({ metadata }) => metadata))
      .toEqual([
        { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
        { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
        { createdAt: testBlockTimestamp, updatedAt: changedTimestamp },
      ]);
    expect(document.blocks.slice(3).map(({ metadata }) => metadata)).toEqual([
      { createdAt: changedTimestamp, updatedAt: changedTimestamp },
      { createdAt: changedTimestamp, updatedAt: changedTimestamp },
    ]);
  });

  it("does not touch note metadata for a presentation-only profile change", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot\n\t: Child");
    let allocations = 0;
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousSource,
      defaultCtnSyntaxProfile,
      { ...defaultCtnSyntaxProfile, name: "Renamed syntax" },
      {
        allocateId() {
          allocations += 1;
          return createTestBlockId(100 + allocations);
        },
        timestamp: changedTimestamp,
      },
    );

    expect(canonicalSource).toBe(previousSource);
    expect(allocations).toBe(0);
  });

  it("rejects stale or incomplete edit descriptions", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot");

    expect(() => reconcile(previousSource, "Title\nChanged", {
      edits: [],
      source: "Title\nChanged",
    })).toThrow("text edits do not produce");
  });
});
