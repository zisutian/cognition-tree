import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import type {
  CtnEditableBlock,
  CtnInlineSpan,
  CtnResolvedBlockRule,
} from "../../../../core/ctn/parser/types";
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
} from "../../../../presentation/editor/ctnDecorations";
import {
  getTextColorClassName,
  getTextColorStyleDeclaration,
  getToneClassName,
  getToneStyleDeclaration,
} from "../../../../presentation/ui/shared/tonePresentation";

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
  it("updates the public checkbox bridge and releases its host", () => {
    const host = { className: "" } as HTMLElement;
    const render = vi.fn(),
      remove = vi.fn(),
      toggle = vi.fn();
    const bridge = { render, remove };
    const view = { state: { facet: () => bridge } } as unknown as EditorView;
    vi.stubGlobal("document", { createElement: () => host });
    try {
      const item = {
        blockId: "task",
        checked: true,
        label: "完成测试",
        lineNumber: 1,
      };
      const callback = { current: toggle };
      const widget = new CtnCheckboxWidget(item, callback);
      expect(widget.toDOM(view)).toBe(host);
      expect(render).toHaveBeenCalledWith(host, item, callback);
      expect(widget.ignoreEvent()).toBe(true);
      const next = new CtnCheckboxWidget({ ...item, checked: false }, callback);
      expect(next.eq(widget)).toBe(false);
      expect(next.updateDOM(host, view)).toBe(true);
      expect(render).toHaveBeenLastCalledWith(
        host,
        { ...item, checked: false },
        callback,
      );
      widget.destroy(host);
      expect(remove).toHaveBeenCalledWith(host);
    } finally {
      vi.unstubAllGlobals();
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
    ).toBe(`ctn-marker ${getTextColorClassName("blue")}`);
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
    ).toBe(`ctn-line ${getToneClassName("gray")}`);
    const diagnosticBlock = createBlock({
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
    });

    expect(getBlockLineDecorationClass(diagnosticBlock, 2)).toBe(
      `ctn-line ${getToneClassName("gray")}`,
    );
    expect(getBlockLineDecorationClass(diagnosticBlock).split(" ")).toEqual(
      expect.arrayContaining(["ctn-line-diagnostic", "has-diagnostics"]),
    );
    expect(
      getBlockLineDecorationStyle(
        createBlock({
          tone: "#4455aa",
        }),
      ),
    ).toBe(getToneStyleDeclaration("#4455aa"));
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
    ).toBe(`ctn-line ${getToneClassName("blue")}`);
    expect(
      getBlockLineDecorationClass(
        createBlock({
          level: 1,
          marker: ":",
          semanticId: "concept",
          tone: "blue",
        }),
      ),
    ).toBe(`ctn-line ${getToneClassName("blue")} ctn-line-concept`);
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
    ).toBe(`ctn-line ${getToneClassName("default")} ctn-line-title`);
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
      `ctn-inline ${getToneClassName("violet")}`,
    );
    expect(getInlineSymbolDecorationClass(single)).toBe(
      `ctn-inline-symbol ${getToneClassName("violet")}`,
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

    expect(getMarkerDecorationClass(block)).toBe(
      `ctn-marker ${getTextColorClassName("#cc8844")}`,
    );
    expect(getMarkerDecorationStyle(block)).toBe(
      getTextColorStyleDeclaration("#cc8844"),
    );
    expect(
      getInlineDecorationClass(
        createInline({
          textColor: "#cc8844",
          tone: "#4455aa",
        }),
      ),
    ).toBe(`ctn-inline ${getToneClassName("#4455aa")}`);
    expect(
      getInlineDecorationStyle(
        createInline({
          textColor: "#cc8844",
          tone: "#4455aa",
        }),
      ),
    ).toBe(getToneStyleDeclaration("#4455aa"));
  });
});
