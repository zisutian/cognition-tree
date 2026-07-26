import { describe, expect, it } from "vitest";
import {
  readBodyTestDocument,
  readEditableTestDocument,
} from "../ctn/analysis/analysisTestHelpers";
import { defaultCtnSyntax } from "../../core/ctn/syntax/defaultSyntax";
import {
  findCtnReferenceAtPosition,
} from "../../presentation/editor/ctnReferenceNavigation";
describe("CTN editor reference navigation", () => {
  it("finds local and global references by source position", () => {
    const document = readEditableTestDocument(
      "Title\n\t: <Local> and [[Global]]",
      defaultCtnSyntax,
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
    const document = readEditableTestDocument(
      "Title\n\t: `code` and text",
      defaultCtnSyntax,
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

  it("uses body-only line numbers when the fixed title is hidden", () => {
    const document = readBodyTestDocument(
      "Root\n\t: <Local> and [[Global]]",
      "2026-07-18 14:35:00",
      defaultCtnSyntax,
    );
    const block = document.blocks[1];
    const global = block.inlineSpans[1];

    expect(block.lineNumber).toBe(2);
    expect(global.lineNumber).toBe(2);
    expect(
      findCtnReferenceAtPosition(
        document,
        2,
        global.startColumn,
      ),
    ).toMatchObject({
      lineNumber: 2,
      text: "Global",
      type: "global-reference",
    });
  });
});
