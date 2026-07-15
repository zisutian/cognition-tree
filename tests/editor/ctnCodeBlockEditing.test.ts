import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import {
  createCtnCodeBlockEnterTransaction,
  createCtnCodeBlockIndentChanges,
} from "../../src/editor/ctnCodeBlockEditing";
import {
  addTestCtnBlockMetadata,
} from "../ctn/metadata/sourceMetadataFixture";

function createFixture() {
  const source = addTestCtnBlockMetadata(
    "Title\nRoot\n\t```ts\n\t\tconst value = 1;\n\t```\n\t: After",
    defaultCtnSyntaxProfile,
  );
  const document = parseCtnDocument(source, defaultCtnSyntaxProfile);
  const state = EditorState.create({
    doc: source,
    extensions: [EditorState.tabSize.of(4)],
  });
  const codeLine = state.doc.line(
    document.blocks.find((block) => block.role === "multiline")!.lineNumber + 1,
  );

  return { codeLine, document, state };
}

describe("CTN code block editing", () => {
  it("preserves code indentation when Enter inserts a line", () => {
    const { codeLine, document, state } = createFixture();
    const selected = state.update({
      selection: { anchor: codeLine.to },
    }).state;
    const transaction = createCtnCodeBlockEnterTransaction(
      selected,
      document,
    );

    expect(transaction).not.toBeNull();
    const updated = selected.update(transaction!).state;

    expect(updated.doc.toString()).toContain(
      "\t\tconst value = 1;\n\t\t",
    );
    expect(updated.selection.main.head).toBe(
      codeLine.to + "\n\t\t".length,
    );
  });

  it("indents and outdents code content without changing its fences", () => {
    const { codeLine, document, state } = createFixture();
    const selected = state.update({
      selection: { anchor: codeLine.from },
    }).state;
    const indentChanges = createCtnCodeBlockIndentChanges(
      selected,
      document,
      "indent",
    );
    const indented = selected.update({ changes: indentChanges! }).state;
    const indentedCodeLine = indented.doc.line(codeLine.number);
    const outdentChanges = createCtnCodeBlockIndentChanges(
      indented.update({
        selection: { anchor: indentedCodeLine.from },
      }).state,
      parseCtnDocument(indented.doc.toString(), defaultCtnSyntaxProfile),
      "outdent",
    );
    const restored = indented.update({ changes: outdentChanges! }).state;

    expect(indented.doc.line(codeLine.number).text).toBe(
      "\t\t\tconst value = 1;",
    );
    expect(restored.doc.line(codeLine.number).text).toBe(
      "\t\tconst value = 1;",
    );
    expect(restored.doc.toString()).toContain("\t```ts");
    expect(restored.doc.toString()).toContain("\t```");
  });

  it("leaves normal CTN lines to the structural indentation keymap", () => {
    const { document, state } = createFixture();
    const normalBlock = document.blocks.find((block) => block.text === "After")!;
    const normalLine = state.doc.line(normalBlock.lineNumber);
    const selected = state.update({
      selection: { anchor: normalLine.from },
    }).state;

    expect(
      createCtnCodeBlockEnterTransaction(selected, document),
    ).toBeNull();
    expect(
      createCtnCodeBlockIndentChanges(selected, document, "indent"),
    ).toBeNull();
  });
});
