import { describe, expect, it } from "vitest";
import { parseCtnEditableDocument } from "../../core/ctn/parser/parseCtnDocument";
import { parseCtnEditableBody } from "../../core/ctn/parser/parseCtnBody";
import { defaultCtnSyntaxProfile } from "../../core/ctn/syntax/defaultSyntaxProfile";
import {
  findCtnReferenceAtPosition,
} from "../../src/editor/ctnReferenceNavigation";
describe("CTN editor reference navigation", () => {
  it("finds local and global references by source position", () => {
    const document = parseCtnEditableDocument(
      "Title\n\t: <Local> and [[Global]]",
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
    const document = parseCtnEditableDocument(
      "Title\n\t: `code` and text",
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

  it("uses body-only line numbers when the fixed title is hidden", () => {
    const document = parseCtnEditableBody(
      "Root\n\t: <Local> and [[Global]]",
      "2026-07-18 14:35:00",
      defaultCtnSyntaxProfile,
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
