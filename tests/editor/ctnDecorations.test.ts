import { describe, expect, it } from "vitest";
import type { CtnBlock } from "../../src/ctn/parseOutline";
import {
  getInlineDecorationStyle,
  getInlineDecorationClass,
  getMarkerDecorationStyle,
  getMarkerDecorationClass,
  shouldDecorateMarker,
} from "../../src/editor/ctnDecorations";

function createBlock(overrides: Partial<CtnBlock>): CtnBlock {
  return {
    children: [],
    diagnostics: [],
    endLineNumber: 1,
    id: "block-1",
    indentText: "",
    inlineSpans: [],
    label: "定义",
    level: 0,
    lineNumber: 1,
    marker: ":",
    role: "normal",
    rawText: ": Definition",
    text: "Definition",
    textColor: "green",
    tone: "green",
    type: "definition",
    ...overrides,
  };
}

describe("ctn editor decorations", () => {
  it("decorates known markers", () => {
    expect(shouldDecorateMarker(createBlock({ marker: ":" }))).toBe(true);
  });

  it("does not decorate unknown markers", () => {
    expect(
      shouldDecorateMarker(
        createBlock({
          diagnostics: [
            {
              code: "unknown-marker",
              column: 1,
              id: "diagnostic-1",
              lineNumber: 1,
              message: "未知行首符号 :。",
              severity: "warning",
            },
          ],
          label: "未知符号",
          marker: ":",
          type: "text",
        }),
      ),
    ).toBe(false);
  });

  it("uses text color classes instead of type classes for markers", () => {
    expect(
      getMarkerDecorationClass(
        createBlock({
          textColor: "blue",
          tone: "red",
          type: "custom-risk",
        }),
      ),
    ).toBe("ctn-marker ctn-text-color-blue");
  });

  it("keeps inline tone and text color separate", () => {
    expect(
      getInlineDecorationClass({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        textColor: "blue",
        tone: "violet",
        type: "custom-inline",
      }),
    ).toBe("ctn-inline ctn-tone-violet ctn-text-color-blue");
  });

  it("uses custom text color classes and CSS variables for hex colors", () => {
    const block = createBlock({
      textColor: "#cc8844",
      tone: "#4455aa",
      type: "custom-risk",
    });

    expect(getMarkerDecorationClass(block)).toBe("ctn-marker ctn-text-color-custom");
    expect(getMarkerDecorationStyle(block)).toBe("--ctn-text-color: #cc8844;");
    expect(
      getInlineDecorationClass({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        textColor: "#cc8844",
        tone: "#4455aa",
        type: "custom-inline",
      }),
    ).toBe("ctn-inline ctn-tone-custom ctn-text-color-custom");
    expect(
      getInlineDecorationStyle({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        textColor: "#cc8844",
        tone: "#4455aa",
        type: "custom-inline",
      }),
    ).toBe("--ctn-tone-color: #4455aa; --ctn-text-color: #cc8844;");
  });
});
