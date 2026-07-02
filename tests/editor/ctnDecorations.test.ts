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

  it("uses tone classes instead of type classes", () => {
    expect(
      getMarkerDecorationClass(
        createBlock({
          tone: "red",
          type: "custom-risk",
        }),
      ),
    ).toBe("ctn-marker ctn-tone-red");
    expect(
      getInlineDecorationClass({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        tone: "violet",
        type: "custom-inline",
      }),
    ).toBe("ctn-inline ctn-tone-violet");
  });

  it("uses custom tone classes and CSS variables for hex colors", () => {
    const block = createBlock({
      tone: "#4455aa",
      type: "custom-risk",
    });

    expect(getMarkerDecorationClass(block)).toBe("ctn-marker ctn-tone-custom");
    expect(getMarkerDecorationStyle(block)).toBe("--ctn-tone-color: #4455aa;");
    expect(
      getInlineDecorationClass({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        tone: "#4455aa",
        type: "custom-inline",
      }),
    ).toBe("ctn-inline ctn-tone-custom");
    expect(
      getInlineDecorationStyle({
        endColumn: 8,
        id: "inline-1",
        label: "自定义",
        lineNumber: 1,
        startColumn: 1,
        text: "value",
        tone: "#4455aa",
        type: "custom-inline",
      }),
    ).toBe("--ctn-tone-color: #4455aa;");
  });
});
