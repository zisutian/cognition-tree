import { describe, expect, it } from "vitest";
import { analyzeCtnSource } from "../../../../core/ctn/analysis/sourceAnalysis";
import {
  recanonicalizeCtnSourceBlockMetadata,
  reconcileCtnSourceBlockMetadata,
} from "../../../../core/ctn/metadata/reconcileSourceMetadata";
import type { CtnEditableSourceChange } from "../../../../core/ctn/metadata/textEdits";
import { readCanonicalTestDocument } from "../analysis/analysisTestHelpers";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import type {
  CtnCompiledSyntax,
  CtnSyntaxDefinition,
} from "../../../../core/ctn/syntax/types";
import {
  compileCtnSyntaxDefinition,
} from "../../../../core/ctn/syntax/compiler";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
  stripTestCtnBlockMetadata,
  testBlockTimestamp,
} from "./sourceMetadataFixture";

const changedTimestamp = "2026-07-15T01:00:00.000Z";
function compileTestSyntax(
  update: (definition: CtnSyntaxDefinition) => void,
): CtnCompiledSyntax {
  const definition = structuredClone(
    defaultCtnSyntax.definition,
  ) as CtnSyntaxDefinition;
  update(definition);
  const result = compileCtnSyntaxDefinition(definition, "workspace");
  if (!result.syntax) throw new Error("Invalid metadata test syntax.");
  return result.syntax;
}

const questionMultilineSyntax = compileTestSyntax((definition) => {
  definition.blocks = definition.blocks.map((rule) =>
    rule.marker === "?" ? { ...rule, kind: "multiline" } : rule
  );
});

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
  const previousAnalysis = analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source: previousSource,
    syntax: defaultCtnSyntax,
  });
  const previousEditableSource =
    previousAnalysis.editableProjection.source;
  const candidateAnalysis = analyzeCtnSource({
    mode: { kind: "editable-document" },
    source: nextEditableSource,
    syntax: defaultCtnSyntax,
  });

  return reconcileCtnSourceBlockMetadata(
    previousAnalysis,
    candidateAnalysis,
    change ?? createReplacementChange(previousEditableSource, nextEditableSource),
    {
      createId: createIdFactory(),
      reservedIds: new Set(),
      timestamp: changedTimestamp,
      touchTitle: true,
    },
  ).source;
}

function parse(source: string) {
  return readCanonicalTestDocument(source, defaultCtnSyntax);
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
      defaultCtnSyntax,
    );
    const previousAnalysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: previousSource,
      syntax: defaultCtnSyntax,
    });
    const candidateAnalysis = analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: previousAnalysis.editableProjection.source,
      syntax: questionMultilineSyntax,
    });
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousAnalysis,
      candidateAnalysis,
      {
        allocateId: createIdFactory(),
        timestamp: changedTimestamp,
        touchTitle: true,
      },
    ).source;
    const document = readCanonicalTestDocument(
      canonicalSource,
      questionMultilineSyntax,
    );

    expect(analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: canonicalSource,
      syntax: questionMultilineSyntax,
    }).editableProjection.source).toBe(editableSource);
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
      questionMultilineSyntax,
    );
    const previousAnalysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: previousSource,
      syntax: questionMultilineSyntax,
    });
    const candidateAnalysis = analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: previousAnalysis.editableProjection.source,
      syntax: defaultCtnSyntax,
    });
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousAnalysis,
      candidateAnalysis,
      {
        allocateId: createIdFactory(),
        timestamp: changedTimestamp,
        touchTitle: true,
      },
    ).source;
    const document = readCanonicalTestDocument(
      canonicalSource,
      defaultCtnSyntax,
    );

    expect(analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: canonicalSource,
      syntax: defaultCtnSyntax,
    }).editableProjection.source).toBe(editableSource);
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
    const nextSyntax = compileTestSyntax((definition) => {
        definition.name = "Renamed syntax";
      });
    const previousAnalysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: previousSource,
      syntax: defaultCtnSyntax,
    });
    const candidateAnalysis = analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: previousAnalysis.editableProjection.source,
      syntax: nextSyntax,
    });
    const canonicalSource = recanonicalizeCtnSourceBlockMetadata(
      previousAnalysis,
      candidateAnalysis,
      {
        allocateId() {
          allocations += 1;
          return createTestBlockId(100 + allocations);
        },
        timestamp: changedTimestamp,
        touchTitle: true,
      },
    ).source;

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
