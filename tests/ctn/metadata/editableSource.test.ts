import { describe, expect, it } from "vitest";
import {
  getCtnEditableLineNumber,
} from "../../../core/ctn/metadata/editableSource";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import { analyzeCanonicalTestSource } from "../analysis/analysisTestHelpers";
import { addTestCtnBlockMetadata } from "./sourceMetadataFixture";

describe("CTN editable source", () => {
  it("projects canonical metadata pairs into plain editable lines", () => {
    const rawSource = [
      "Title",
      "Root",
      "\t```text",
      "\t@ctn-block id=example",
      "\t```",
      "Sibling",
    ].join("\n");
    const canonicalSource = addTestCtnBlockMetadata(rawSource);
    const editableSource = analyzeCanonicalTestSource(
      canonicalSource,
      defaultCtnSyntax,
    ).editableProjection;

    expect(editableSource.source).toBe(rawSource);
    expect(getCtnEditableLineNumber(editableSource, 2)).toBe(1);
    expect(getCtnEditableLineNumber(editableSource, 4)).toBe(2);
    expect(getCtnEditableLineNumber(editableSource, 6)).toBe(3);
    expect(getCtnEditableLineNumber(editableSource, 7)).toBe(4);
    expect(getCtnEditableLineNumber(editableSource, 8)).toBe(5);
    expect(getCtnEditableLineNumber(editableSource, 10)).toBe(6);
  });

  it("keeps candidate metadata associated with its editable block line", () => {
    const canonicalSource = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Child",
    );
    const editableSource = analyzeCanonicalTestSource(
      canonicalSource,
      defaultCtnSyntax,
    ).editableProjection;

    expect([...editableSource.metadataByLineNumber.keys()]).toEqual([1, 2, 3]);
  });
});
