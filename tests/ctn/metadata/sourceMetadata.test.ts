import { describe, expect, it } from "vitest";
import {
  CtnDocumentMetadataError,
  parseCtnDocument,
} from "../../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
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
    const document = parseCtnDocument(source, defaultCtnSyntaxProfile);

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
      parseCtnDocument("Title\nRoot", defaultCtnSyntaxProfile),
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

    expect(() => parseCtnDocument(misindented, defaultCtnSyntaxProfile))
      .toThrow("metadata indentation does not match");
    expect(() => parseCtnDocument(duplicate, defaultCtnSyntaxProfile))
      .toThrow(`duplicate block id ${createTestBlockId(2)}`);
  });
});
