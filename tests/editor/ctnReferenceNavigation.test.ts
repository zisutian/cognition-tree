import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import {
  findCtnReferenceAtPosition,
} from "../../src/editor/ctnReferenceNavigation";
import {
  addTestCtnBlockMetadata,
} from "../ctn/metadata/sourceMetadataFixture";

describe("CTN editor reference navigation", () => {
  it("finds local and global references by source position", () => {
    const document = parseCtnDocument(
      addTestCtnBlockMetadata(
        "Title\n\t: <Local> and [[Global]]",
        defaultCtnSyntaxProfile,
      ),
      defaultCtnSyntaxProfile,
    );
    const block = document.blocks[1];
    const [local, global] = block.inlineSpans;

    expect(
      findCtnReferenceAtPosition(
        document,
        block.lineNumber,
        local.startColumn,
      ),
    ).toMatchObject({ text: "Local", type: "local-reference" });
    expect(
      findCtnReferenceAtPosition(
        document,
        block.lineNumber,
        global.endColumn - 1,
      ),
    ).toMatchObject({ text: "Global", type: "global-reference" });
  });

  it("ignores non-reference spans and positions outside a span", () => {
    const document = parseCtnDocument(
      addTestCtnBlockMetadata(
        "Title\n\t: `code` and text",
        defaultCtnSyntaxProfile,
      ),
      defaultCtnSyntaxProfile,
    );
    const block = document.blocks[1];

    expect(
      findCtnReferenceAtPosition(
        document,
        block.lineNumber,
        block.inlineSpans[0].startColumn,
      ),
    ).toBeNull();
    expect(
      findCtnReferenceAtPosition(document, block.lineNumber, 999),
    ).toBeNull();
  });
});
