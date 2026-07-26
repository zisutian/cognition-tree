import { describe, expect, it, vi } from "vitest";
import type {
  CtnEditableBlock,
  CtnInlineSpan,
  CtnResolvedBlockRule,
} from "../../core/ctn/parser/types";
import {
  CtnCheckboxWidget,
  getBlockLineDecorationClass,
  getBlockLineDecorationStyle,
  getInlineDecorationStyle,
  getInlineDecorationClass,
  getInlineSymbolDecorationClass,
  getInlineSymbolOffsets,
  getMarkerDecorationStyle,
  getMarkerDecorationClass,
  shouldDecorateMarker,
} from "../../presentation/editor/ctnDecorations";

type BlockOverrides = Omit<Partial<CtnEditableBlock>, "rule"> & {
  kind?: CtnResolvedBlockRule["kind"];
  label?: string;
  rule?: Partial<CtnResolvedBlockRule>;
  semanticId?: string;
  textColor?: CtnResolvedBlockRule["textColor"];
  tone?: CtnResolvedBlockRule["tone"];
};

function createBlock(overrides: BlockOverrides): CtnEditableBlock {
  const {
    kind = "line",
    label = "定义",
    rule,
    semanticId = "definition",
    textColor = "green",
    tone = "green",
    ...blockOverrides
  } = overrides;

  return {
    children: [],
    contentFingerprint: ": Definition",
    diagnostics: [],
    indentText: "",
    inlineSpans: [],
    level: 0,
    lexicalEndLineNumber: 1,
    lineNumber: 1,
    marker: ":",
    multilineRange: null,
    rawText: ": Definition",
    rule: {
      kind,
      label,
      marker: blockOverrides.marker ?? ":",
      semanticId,
      textColor,
      tone,
      ...rule,
    } as CtnResolvedBlockRule,
    subtreeEndLineNumber: 1,
    text: "Definition",
    textStartColumn: 3,
    ...blockOverrides,
  };
}

function createInline(
  overrides: {
    label?: string;
    semanticId?: string;
    textColor?: CtnInlineSpan["rule"]["textColor"];
    tone?: CtnInlineSpan["rule"]["tone"];
  } = {},
): CtnInlineSpan {
  return {
    endColumn: 8,
    id: "inline-1",
    lineNumber: 1,
    rule: {
      kind: "single",
      label: overrides.label ?? "自定义",
      marker: "|",
      semanticId: overrides.semanticId ?? "custom-inline",
      textColor: overrides.textColor ?? "blue",
      tone: overrides.tone ?? "violet",
    },
    startColumn: 1,
    text: "value",
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
          semanticId: "text",
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
          semanticId: "custom-risk",
        }),
      ),
    ).toBe("ctn-marker ctn-text-color-blue");
  });

  it("uses tone classes for block line backgrounds", () => {
    expect(
      getBlockLineDecorationClass(
        createBlock({
          kind: "multiline",
          textColor: "green",
          tone: "gray",
          semanticId: "multiline-block",
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
          kind: "multiline",
          tone: "gray",
          semanticId: "multiline-block",
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
        createBlock({
          level: 0,
          marker: null,
          semanticId: "body",
          tone: "blue",
        }),
      ),
    ).toBe("ctn-line ctn-tone-blue");
    expect(
      getBlockLineDecorationClass(
        createBlock({
          level: 1,
          marker: ":",
          semanticId: "concept",
          tone: "blue",
        }),
      ),
    ).toBe("ctn-line ctn-tone-blue ctn-line-concept");
  });

  it("marks the semantic title line for strong editor typography", () => {
    expect(
      getBlockLineDecorationClass(
        createBlock({
          marker: null,
          semanticId: "title",
          tone: "default",
        }),
      ),
    ).toBe("ctn-line ctn-tone-default ctn-line-title");
  });

  it("uses one inline tone for the underline and syntax symbols", () => {
    const single = createInline({
      textColor: "blue",
      tone: "violet",
    });
    const paired: CtnInlineSpan = {
      ...single,
      rule: {
        close: "]]",
        kind: "paired",
        label: "引用",
        open: "[[",
        semanticId: "global-reference",
        textColor: "cyan",
        tone: "blue",
      },
    };

    expect(getInlineDecorationClass(single)).toBe(
      "ctn-inline ctn-tone-violet",
    );
    expect(getInlineSymbolDecorationClass(single)).toBe(
      "ctn-inline-symbol ctn-tone-violet",
    );
    expect(getInlineSymbolOffsets(single, "left|right")).toEqual([
      { from: 4, to: 5 },
    ]);
    expect(getInlineSymbolOffsets(paired, "[[Target]]")).toEqual([
      { from: 0, to: 2 },
      { from: 8, to: 10 },
    ]);
    expect(getInlineSymbolOffsets(paired, "Target")).toEqual([]);
  });

  it("uses custom color variables without applying inline font color", () => {
    const block = createBlock({
      textColor: "#cc8844",
      tone: "#4455aa",
      semanticId: "custom-risk",
    });

    expect(getMarkerDecorationClass(block)).toBe("ctn-marker ctn-text-color-custom");
    expect(getMarkerDecorationStyle(block)).toBe("--ctn-text-color: #cc8844;");
    expect(
      getInlineDecorationClass(createInline({
        textColor: "#cc8844",
        tone: "#4455aa",
      })),
    ).toBe("ctn-inline ctn-tone-custom");
    expect(
      getInlineDecorationStyle(createInline({
        textColor: "#cc8844",
        tone: "#4455aa",
      })),
    ).toBe("--ctn-tone-color: #4455aa;");
  });

});
