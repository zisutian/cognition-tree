import { describe, expect, it } from "vitest";
import type { CtnBlock } from "../../src/ctn/parseOutline";
import { shouldDecorateMarker } from "../../src/editor/ctnDecorations";

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
    rawText: ": Definition",
    text: "Definition",
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
});
