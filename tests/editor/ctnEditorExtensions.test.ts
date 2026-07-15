import { describe, expect, it } from "vitest";
import {
  createCtnIndentUnit,
  createCtnParsingExtensions,
  createCtnTabSizeExtension,
} from "../../src/editor/ctnEditorExtensions";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
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

  it("keeps CTN source lines from soft wrapping", () => {
    expect(ctnEditorExtensionsSource).not.toContain("EditorView.lineWrapping");
  });

  it("omits CTN parsing and diagnostics in raw mode", () => {
    const syntaxProfileRef = { current: defaultCtnSyntaxProfile };

    expect(createCtnParsingExtensions(syntaxProfileRef, "raw")).toEqual([]);
    expect(createCtnParsingExtensions(syntaxProfileRef, "ctn")).toHaveLength(2);
  });
});
