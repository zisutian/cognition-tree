import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { parseCtnEditableDocument } from "../../core/ctn/parser/parseCtnDocument";
import { parseCtnEditableBody } from "../../core/ctn/parser/parseCtnBody";
import { defaultCtnSyntaxProfile } from "../../core/ctn/syntax/defaultSyntaxProfile";
import {
  createCtnCodeBlockEnterTransaction,
  createCtnCodeBlockIndentChanges,
  createCtnCodeBlockStructuralIndentChanges,
} from "../../presentation/editor/ctnCodeBlockCommands";
function createFixture() {
  const source =
    "Title\nRoot\n\t```ts\n\t\tconst value = 1;\n\t```\n\t: After";
  const document = parseCtnEditableDocument(source, defaultCtnSyntaxProfile);
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
      selection: { anchor: codeLine.from + "\t\t".length },
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
        selection: { anchor: indentedCodeLine.from + "\t\t".length },
      }).state,
      parseCtnEditableDocument(
        indented.doc.toString(),
        defaultCtnSyntaxProfile,
      ),
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

  it("does not batch-indent selected code text", () => {
    const { codeLine, document, state } = createFixture();
    const selected = state.update({
      selection: {
        anchor: codeLine.from + "\t\t".length,
        head: codeLine.to,
      },
    }).state;

    expect(
      createCtnCodeBlockIndentChanges(selected, document, "indent"),
    ).toEqual([]);
    expect(
      createCtnCodeBlockIndentChanges(selected, document, "outdent"),
    ).toEqual([]);
  });

  it("changes the complete multiline block level from its card header", () => {
    const { document, state } = createFixture();
    const block = document.blocks.find(({ role }) => role === "multiline")!;
    const opener = state.doc.line(block.lineNumber);
    const selected = state.update({
      selection: { anchor: opener.to },
    }).state;
    const changes = createCtnCodeBlockStructuralIndentChanges(
      selected,
      document,
      "indent",
    );
    const updated = selected.update({ changes: changes! }).state;

    expect(updated.doc.line(block.lineNumber).text).toBe("\t\t```ts");
    expect(updated.doc.line(block.lineNumber + 1).text).toBe(
      "\t\t\tconst value = 1;",
    );
    expect(updated.doc.line(block.lineNumber + 2).text).toBe("\t\t```");
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

  it("keeps editing the final body line of an unterminated multiline block", () => {
    const source = "Title\n\t```ts\n\t\tconst value = 1;";
    const document = parseCtnEditableDocument(
      source,
      defaultCtnSyntaxProfile,
    );
    const state = EditorState.create({
      doc: source,
      extensions: [EditorState.tabSize.of(4)],
      selection: { anchor: source.length },
    });
    const transaction = createCtnCodeBlockEnterTransaction(state, document);

    expect(transaction).not.toBeNull();
    expect(state.update(transaction!).state.doc.toString()).toBe(
      `${source}\n\t\t`,
    );
  });

  it("auto-closes a recognized multiline opener", () => {
    const source = "Title\n\t```ts";
    const document = parseCtnEditableDocument(
      source,
      defaultCtnSyntaxProfile,
    );
    const state = EditorState.create({
      doc: source,
      extensions: [EditorState.tabSize.of(4)],
      selection: { anchor: source.length },
    });
    const transaction = createCtnCodeBlockEnterTransaction(state, document);
    const updated = state.update(transaction!).state;

    expect(updated.doc.toString()).toBe(
      "Title\n\t```ts\n\t\t\n\t```",
    );
    expect(updated.selection.main.head).toBe(
      "Title\n\t```ts\n\t\t".length,
    );
  });

  it("edits multiline blocks using body-only editor line numbers", () => {
    const source = "Root\n\t```ts\n\t\tconst value = 1;\n\t```";
    const document = parseCtnEditableBody(
      source,
      "2026-07-18 14:35:00",
      defaultCtnSyntaxProfile,
    );
    const state = EditorState.create({
      doc: source,
      extensions: [EditorState.tabSize.of(4)],
    });
    const multiline = document.blocks.find(
      (block) => block.role === "multiline",
    )!;
    const codeLine = state.doc.line(3);
    const selected = state.update({
      selection: { anchor: codeLine.to },
    }).state;
    const transaction = createCtnCodeBlockEnterTransaction(
      selected,
      document,
    );

    expect(multiline.lineNumber).toBe(2);
    expect(multiline.multilineRange).toMatchObject({
      closingFenceLineNumber: 4,
      contentEndLineNumber: 3,
      contentStartLineNumber: 3,
    });
    expect(transaction).not.toBeNull();
    expect(selected.update(transaction!).state.doc.toString()).toContain(
      "\t\tconst value = 1;\n\t\t\n\t```",
    );
  });
});
