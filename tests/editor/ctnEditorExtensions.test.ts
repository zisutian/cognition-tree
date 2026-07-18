import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  createCtnIndentUnit,
  createCtnParsingExtensions,
  createCtnTabSizeExtension,
  getCtnEditorActiveLineNumber,
} from "../../src/editor/ctnEditorExtensions";
import { defaultCtnSyntaxProfile } from "../../ctn/syntax/defaultSyntaxProfile";
import ctnEditorExtensionsSource from "../../src/editor/ctnEditorExtensions.ts?raw";

describe("ctn editor extensions", () => {
  it("stores editor indentation as tabs", () => {
    expect(createCtnIndentUnit()).toBe("\t");
  });

  it("creates configurable tab display width extensions", () => {
    expect(createCtnTabSizeExtension(2)).toBeDefined();
    expect(createCtnTabSizeExtension(4)).toBeDefined();
    expect(createCtnTabSizeExtension(6)).toBeDefined();
  });

  it("reports the line containing the primary editor selection", () => {
    const state = EditorState.create({
      doc: "first\nsecond\nthird",
      selection: { anchor: 8 },
    });

    expect(getCtnEditorActiveLineNumber(state)).toBe(2);
  });

  it("keeps CTN source lines from soft wrapping", () => {
    expect(ctnEditorExtensionsSource).not.toContain("EditorView.lineWrapping");
  });

  it("omits CTN parsing and diagnostics in raw mode", () => {
    const syntaxProfileRef = { current: defaultCtnSyntaxProfile };
    const onOpenReferenceRef = { current: undefined };

    expect(
      createCtnParsingExtensions(
        syntaxProfileRef,
        onOpenReferenceRef,
        { kind: "raw" },
      ),
    ).toEqual([]);
    expect(
      createCtnParsingExtensions(
        syntaxProfileRef,
        onOpenReferenceRef,
        { kind: "document" },
      ),
    ).toHaveLength(5);
    expect(
      createCtnParsingExtensions(
        syntaxProfileRef,
        onOpenReferenceRef,
        { kind: "body", title: "2026-07-18 14:35:00" },
      ),
    ).toHaveLength(5);
  });
});
