import { describe, expect, it } from "vitest";
import {
  initializeCtnRawSourceBlockMetadata,
  initializeCtnSourceBlockMetadata,
} from "../../../../core/ctn/metadata/sourceMetadata";
import {
  CtnDocumentMetadataError,
} from "../../../../core/ctn/parser/parseCtnDocument";
import {
  analyzeCanonicalTestSource,
  readCanonicalTestDocument,
} from "../analysis/analysisTestHelpers";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
  testBlockTimestamp,
} from "./sourceMetadataFixture";

describe("CTN source block metadata", () => {
  it("initializes every parsed block with a stable metadata/source pair", () => {
    const source = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Child\n\t\t- Leaf",
    );
    const document = readCanonicalTestDocument(source, defaultCtnSyntax);

    expect(source.split("\n")).toEqual([
      expect.stringMatching(/^@ctn-block id=/),
      "Title",
      expect.stringMatching(/^@ctn-block id=/),
      "Root",
      expect.stringMatching(/^\t@ctn-block id=/),
      "\t: Child",
      expect.stringMatching(/^\t\t@ctn-block id=/),
      "\t\t- Leaf",
    ]);
    expect(document.blocks.map((block) => ({
      id: block.id,
      lineNumber: block.lineNumber,
      metadata: block.metadata,
      metadataLineNumber: block.metadataLineNumber,
    }))).toEqual([
      {
        id: createTestBlockId(1),
        lineNumber: 2,
        metadata: {
          createdAt: testBlockTimestamp,
          updatedAt: testBlockTimestamp,
        },
        metadataLineNumber: 1,
      },
      {
        id: createTestBlockId(2),
        lineNumber: 4,
        metadata: {
          createdAt: testBlockTimestamp,
          updatedAt: testBlockTimestamp,
        },
        metadataLineNumber: 3,
      },
      {
        id: createTestBlockId(3),
        lineNumber: 6,
        metadata: {
          createdAt: testBlockTimestamp,
          updatedAt: testBlockTimestamp,
        },
        metadataLineNumber: 5,
      },
      {
        id: createTestBlockId(4),
        lineNumber: 8,
        metadata: {
          createdAt: testBlockTimestamp,
          updatedAt: testBlockTimestamp,
        },
        metadataLineNumber: 7,
      },
    ]);
  });

  it("rejects missing, misindented, and duplicate metadata", () => {
    expect(() =>
      readCanonicalTestDocument("Title\nRoot", defaultCtnSyntax),
    ).toThrow(CtnDocumentMetadataError);

    const source = addTestCtnBlockMetadata("Title\nRoot\n\t: Child");
    const misindented = source.replace(
      `\t@ctn-block id=${createTestBlockId(3)}`,
      `@ctn-block id=${createTestBlockId(3)}`,
    );
    const duplicate = source.replace(
      `id=${createTestBlockId(3)}`,
      `id=${createTestBlockId(2)}`,
    );

    expect(() => readCanonicalTestDocument(misindented, defaultCtnSyntax))
      .toThrow("metadata indentation does not match");
    expect(() => readCanonicalTestDocument(duplicate, defaultCtnSyntax))
      .toThrow(`duplicate block id ${createTestBlockId(2)}`);
  });

  it("requires explicit allocation and never reuses a reserved workspace id", () => {
    let nextId = 1;
    const source = initializeCtnSourceBlockMetadata(
      "Title",
      defaultCtnSyntax,
      {
        createdAt: testBlockTimestamp,
        createId: () => createTestBlockId(nextId++),
        reservedIds: new Set([createTestBlockId(1)]),
        updatedAt: testBlockTimestamp,
      },
    );

    expect(readCanonicalTestDocument(source, defaultCtnSyntax).blocks[0].id)
      .toBe(createTestBlockId(2));
    expect(() => initializeCtnSourceBlockMetadata(
      "Title",
      defaultCtnSyntax,
      {
        createdAt: testBlockTimestamp,
        createId: () => createTestBlockId(3),
        reservedIds: new Set(["invalid"]),
        updatedAt: testBlockTimestamp,
      },
    )).toThrow("Invalid reserved CTN block id");
  });

  it("canonicalizes an opaque raw body while preserving title metadata", () => {
    const rawDirective = `@ctn-block id=${createTestBlockId(999)} created=${testBlockTimestamp} updated=${testBlockTimestamp}`;
    const rawSource = `${addTestCtnBlockMetadata("Title")}\nRoot\n${rawDirective}`;
    const conversionTimestamp = "2026-07-16T00:00:00.000Z";
    let nextId = 100;
    const canonicalSource = initializeCtnRawSourceBlockMetadata(
      rawSource,
      defaultCtnSyntax,
      {
        allocateId: () => createTestBlockId(++nextId),
        timestamp: conversionTimestamp,
      },
    );
    const document = readCanonicalTestDocument(
      canonicalSource,
      defaultCtnSyntax,
    );

    expect(analyzeCanonicalTestSource(
      canonicalSource,
      defaultCtnSyntax,
    ).editableProjection.source).toBe(`Title\nRoot\n${rawDirective}`);
    expect(document.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(101),
      createTestBlockId(102),
    ]);
    expect(document.blocks[0]?.metadata).toEqual({
      createdAt: testBlockTimestamp,
      updatedAt: conversionTimestamp,
    });
    expect(document.blocks.slice(1).map((block) => block.metadata)).toEqual([
      { createdAt: conversionTimestamp, updatedAt: conversionTimestamp },
      { createdAt: conversionTimestamp, updatedAt: conversionTimestamp },
    ]);
    expect(document.blocks[2]?.diagnostics.map(({ code }) => code)).toContain(
      "reserved-directive",
    );
  });
});
