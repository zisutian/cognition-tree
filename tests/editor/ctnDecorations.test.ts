import { describe, expect, it, vi } from "vitest";
import type { CtnEditableBlock } from "../../core/ctn/parser/types";
import {
  CtnCheckboxWidget,
  getBlockLineDecorationClass,
  getBlockLineDecorationStyle,
  getInlineDecorationStyle,
  getInlineDecorationClass,
  getMarkerDecorationStyle,
  getMarkerDecorationClass,
  getMultilineMarkDecorationClass,
  getMultilineMarkDecorationStyle,
  shouldDecorateMarker,
} from "../../presentation/editor/ctnDecorations";

function createBlock(
  overrides: Partial<CtnEditableBlock>,
): CtnEditableBlock {
  return {
    children: [],
    contentFingerprint: ": Definition",
    diagnostics: [],
    indentText: "",
    inlineSpans: [],
    label: "定义",
    level: 0,
    lexicalEndLineNumber: 1,
    lineNumber: 1,
    marker: ":",
    multilineRange: null,
    role: "normal",
    rawText: ": Definition",
    subtreeEndLineNumber: 1,
    text: "Definition",
    textColor: "green",
    textStartColumn: 3,
    tone: "green",
    type: "definition",
    ...overrides,
  };
}

describe("ctn editor decorations", () => {
  it("routes checkbox changes to the current Todo callback and ignores editor events", () => {
    class FakeCheckbox extends EventTarget {
      checked = false;
      className = "";
      readonly tagName = "INPUT";
      type = "";
      readonly attributes = new Map<string, string>();

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }
    }

    const checkbox = new FakeCheckbox();
    const originalDocument = globalThis.document;
    const onToggle = vi.fn();

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => checkbox },
    });
    try {
      const widget = new CtnCheckboxWidget(
        {
          blockId: "00000000-0000-4000-8000-000000000001",
          checked: true,
          label: "完成测试",
          lineNumber: 1,
        },
        { current: onToggle },
      );
      const dom = widget.toDOM();

      expect(dom).toBe(checkbox);
      expect(checkbox.checked).toBe(true);
      expect(checkbox.attributes.get("aria-label")).toBe("标记未完成 完成测试");
      expect(widget.ignoreEvent()).toBe(true);

      expect(
        checkbox.dispatchEvent(new Event("change", { cancelable: true })),
      ).toBe(true);

      expect(onToggle).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000001",
      );

      const updatedWidget = new CtnCheckboxWidget(
        {
          blockId: "00000000-0000-4000-8000-000000000001",
          checked: false,
          label: "更新测试",
          lineNumber: 1,
        },
        { current: onToggle },
      );

      expect(
        updatedWidget.updateDOM(checkbox as unknown as HTMLElement),
      ).toBe(true);
      expect(checkbox.checked).toBe(false);
      expect(checkbox.attributes.get("aria-label")).toBe(
        "标记完成 更新测试",
      );
    } finally {
      if (originalDocument) {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });

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

  it("uses tone classes for block line backgrounds", () => {
    expect(
      getBlockLineDecorationClass(
        createBlock({
          role: "multiline",
          textColor: "green",
          tone: "gray",
          type: "multiline-block",
        }),
      ),
    ).toBe("ctn-line ctn-tone-gray");
    expect(
      getBlockLineDecorationClass(
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
          lexicalEndLineNumber: 3,
          multilineRange: {
            closingFenceLineNumber: 3,
            contentEndLineNumber: 2,
            contentStartLineNumber: 2,
            status: "closed",
          },
          role: "multiline",
          tone: "gray",
          type: "multiline-block",
        }),
        2,
      ),
    ).toBe("ctn-line ctn-tone-gray");
    expect(
      getBlockLineDecorationStyle(
        createBlock({
          tone: "#4455aa",
        }),
      ),
    ).toBe("--ctn-tone-color: #4455aa;");
  });

  it("applies concept emphasis by semantic type rather than line shape", () => {
    expect(
      getBlockLineDecorationClass(
        createBlock({ level: 0, marker: null, tone: "blue", type: "body" }),
      ),
    ).toBe("ctn-line ctn-tone-blue");
    expect(
      getBlockLineDecorationClass(
        createBlock({ level: 1, marker: ":", tone: "blue", type: "concept" }),
      ),
    ).toBe("ctn-line ctn-tone-blue ctn-line-concept");
  });

  it("marks the semantic title line for strong editor typography", () => {
    expect(
      getBlockLineDecorationClass(
        createBlock({ marker: null, tone: "default", type: "title" }),
      ),
    ).toBe("ctn-line ctn-tone-default ctn-line-title");
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

  it("applies text color classes across multiline block marks", () => {
    const block = createBlock({
      lexicalEndLineNumber: 4,
      lineNumber: 1,
      multilineRange: {
        closingFenceLineNumber: 4,
        contentEndLineNumber: 3,
        contentStartLineNumber: 2,
        status: "closed",
      },
      role: "multiline",
      textColor: "green",
      tone: "gray",
      type: "multiline-block",
    });

    expect(getMultilineMarkDecorationClass(block, 1)).toBe(
      "ctn-multiline-block-mark ctn-text-color-green ctn-multiline-block-start",
    );
    expect(getMultilineMarkDecorationClass(block, 2)).toBe(
      "ctn-multiline-block-mark ctn-text-color-green",
    );
    expect(getMultilineMarkDecorationClass(block, 4)).toBe(
      "ctn-multiline-block-mark ctn-text-color-green ctn-multiline-block-end",
    );
    expect(getMultilineMarkDecorationStyle(block)).toBeUndefined();
  });

  it("applies custom text color styles across multiline block marks", () => {
    const block = createBlock({
      lexicalEndLineNumber: 3,
      lineNumber: 1,
      multilineRange: {
        closingFenceLineNumber: 3,
        contentEndLineNumber: 2,
        contentStartLineNumber: 2,
        status: "closed",
      },
      role: "multiline",
      textColor: "#cc8844",
      type: "multiline-block",
    });

    expect(getMultilineMarkDecorationClass(block, 2)).toBe(
      "ctn-multiline-block-mark ctn-text-color-custom",
    );
    expect(getMultilineMarkDecorationStyle(block)).toBe(
      "--ctn-text-color: #cc8844;",
    );
  });
});
