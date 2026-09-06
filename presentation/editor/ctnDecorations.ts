import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import type {
  EditorState,
} from "@codemirror/state";
import type {
  CtnEditableBlock,
  CtnEditableDocument,
  CtnInlineSpan,
} from "../../core/ctn/index.ts";
import {
  checkboxControlClassName,
  getTextColorClassName,
  getTextColorStyleDeclaration,
  getToneClassName,
  getToneStyleDeclaration,
} from "../ui/index.ts";
import {
  type CtnEditorAnalysisState,
  type CtnEditorAnalysisField,
} from "./ctnEditorAnalysis.ts";
import {
  createCtnEditorCheckableBlocksKey,
  type CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks.ts";
import {
  ctnEditorRuntimeConfigFacet,
  requireCtnEditorRuntimeConfig,
} from "./ctnEditorRuntime.ts";

export class CtnCheckboxWidget extends WidgetType {
  constructor(
    readonly item: CtnEditorCheckableBlock,
    readonly onToggleRef: {
      current: ((blockId: string) => void) | undefined;
    },
  ) {
    super();
  }

  eq(other: CtnCheckboxWidget) {
    return this.item.blockId === other.item.blockId &&
      this.item.checked === other.item.checked &&
      this.item.label === other.item.label;
  }

  updateDOM(dom: HTMLElement) {
    if (dom.tagName !== "INPUT") return false;

    const checkbox = dom as HTMLInputElement;

    checkbox.checked = this.item.checked;
    checkbox.setAttribute(
      "aria-label",
      `${this.item.checked ? "标记未完成" : "标记完成"} ${this.item.label}`,
    );
    return true;
  }

  toDOM() {
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = this.item.checked;
    checkbox.className = `${checkboxControlClassName} ctn-todo-checkbox`;
    checkbox.setAttribute(
      "aria-label",
      `${this.item.checked ? "标记未完成" : "标记完成"} ${this.item.label}`,
    );
    checkbox.addEventListener("mousedown", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      this.onToggleRef.current?.(this.item.blockId);
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

export class CtnRecurrenceMarkerWidget extends WidgetType {
  constructor(
    readonly progress: NonNullable<
      CtnEditorCheckableBlock["recurrenceProgress"]
    >,
  ) {
    super();
  }

  eq(other: CtnRecurrenceMarkerWidget) {
    return this.progress.text === other.progress.text &&
      this.progress.ariaLabel === other.progress.ariaLabel;
  }

  toDOM() {
    const marker = document.createElement("span");

    marker.className = "ctn-todo-recurrence-marker";
    marker.setAttribute("aria-label", this.progress.ariaLabel);
    marker.setAttribute("role", "img");
    marker.title = this.progress.ariaLabel;
    marker.textContent = this.progress.text;
    return marker;
  }

  ignoreEvent() {
    return true;
  }
}

function isConceptBlock(block: CtnEditableBlock) {
  return block.rule.semanticId === "concept";
}

function getBlockTextClass(block: CtnEditableBlock) {
  const textColorClass = getTextColorClassName(block.rule.textColor);

  if (isConceptBlock(block)) {
    return `ctn-block-text ctn-block-text-concept ${textColorClass}`;
  }

  return `ctn-block-text ${textColorClass}`;
}

function getBlockTextStart(block: CtnEditableBlock) {
  return Math.max(0, block.textStartColumn - 1);
}

function getLineTextStart(lineText: string) {
  return lineText.match(/^\s*/)?.[0].length ?? 0;
}

export function shouldDecorateMarker(block: CtnEditableBlock) {
  return (
    block.marker !== null &&
    !block.diagnostics.some((diagnostic) => diagnostic.code === "unknown-marker")
  );
}

export function getMarkerDecorationClass(block: CtnEditableBlock) {
  return `ctn-marker ${getTextColorClassName(block.rule.textColor)}`;
}

export function getBlockLineDecorationClass(
  block: CtnEditableBlock,
  lineNumber = block.lineNumber,
) {
  const lineClasses = ["ctn-line", getToneClassName(block.rule.tone)];
  const isBlockStartLine = lineNumber === block.lineNumber;

  if (isBlockStartLine && block.rule.semanticId === "title") {
    lineClasses.push("ctn-line-title");
  }

  if (isBlockStartLine && isConceptBlock(block)) {
    lineClasses.push("ctn-line-concept");
  }

  if (isBlockStartLine && block.diagnostics.length > 0) {
    lineClasses.push("ctn-line-diagnostic", "has-diagnostics");
  }

  return lineClasses.join(" ");
}

export function getBlockLineDecorationStyle(block: CtnEditableBlock) {
  return getToneStyleDeclaration(block.rule.tone);
}

export function getInlineDecorationClass(span: CtnInlineSpan) {
  return `ctn-inline ${getToneClassName(span.rule.tone)}`;
}

export function getInlineSymbolDecorationClass(span: CtnInlineSpan) {
  return `ctn-inline-symbol ${getToneClassName(span.rule.tone)}`;
}

export function getMarkerDecorationStyle(block: CtnEditableBlock) {
  return getTextColorStyleDeclaration(block.rule.textColor);
}

export function getInlineDecorationStyle(span: CtnInlineSpan) {
  return getToneStyleDeclaration(span.rule.tone) ?? "";
}

export function getInlineSymbolOffsets(
  span: CtnInlineSpan,
  sourceText: string,
) {
  if (span.rule.kind === "paired") {
    if (
      !sourceText.startsWith(span.rule.open) ||
      !sourceText.endsWith(span.rule.close)
    ) {
      return [];
    }
    return [
      { from: 0, to: span.rule.open.length },
      {
        from: sourceText.length - span.rule.close.length,
        to: sourceText.length,
      },
    ];
  }
  const markerFrom = sourceText.indexOf(span.rule.marker);

  return markerFrom < 0
    ? []
    : [{
        from: markerFrom,
        to: markerFrom + span.rule.marker.length,
      }];
}

function getBlockTextDecorationStyle(block: CtnEditableBlock) {
  return getTextColorStyleDeclaration(block.rule.textColor);
}

function buildCtnDecorations(
  state: EditorState,
  parsedDocument: CtnEditableDocument,
  checkableBlocks: readonly CtnEditorCheckableBlock[] = [],
  onToggleCheckableBlockRef: {
    current: ((blockId: string) => void) | undefined;
  } = { current: undefined },
): DecorationSet {
  const decorations = [];
  const checkableByLineNumber = new Map(
    checkableBlocks.map((item) => [item.lineNumber, item]),
  );

  for (const block of parsedDocument.blocks) {
    if (
      block.rule.kind === "multiline" &&
      block.lexicalEndLineNumber > block.lineNumber
    ) {
      for (
        let lineNumber = block.lineNumber + 1;
        lineNumber <= Math.min(block.lexicalEndLineNumber, state.doc.lines);
        lineNumber += 1
      ) {
        const sourceLine = state.doc.line(lineNumber);
        const textStart = getLineTextStart(sourceLine.text);
        const lineStyle = getBlockLineDecorationStyle(block);
        const textStyle = getBlockTextDecorationStyle(block);

        decorations.push(
          Decoration.line({
            attributes: {
              class: getBlockLineDecorationClass(block, lineNumber),
              ...(lineStyle ? { style: lineStyle } : {}),
            },
          }).range(sourceLine.from),
        );
        if (textStart < sourceLine.text.length) {
          decorations.push(
            Decoration.mark({
              attributes: {
                class: getBlockTextClass(block),
                ...(textStyle ? { style: textStyle } : {}),
              },
            }).range(sourceLine.from + textStart, sourceLine.to),
          );
        }
      }
    }

    const line = state.doc.line(block.lineNumber);
    const lineStyle = getBlockLineDecorationStyle(block);

    const diagnosticTitle = block.diagnostics
      .map((diagnostic) => diagnostic.message)
      .join("\n");

    decorations.push(
      Decoration.line({
        attributes: {
          class: getBlockLineDecorationClass(block),
          ...(diagnosticTitle ? { title: diagnosticTitle } : {}),
          ...(lineStyle ? { style: lineStyle } : {}),
        },
      }).range(line.from),
    );

    const blockTextClass = getBlockTextClass(block);

    if (blockTextClass) {
      const textStart = getBlockTextStart(block);
      if (textStart < line.text.length) {
        const blockTextStyle = getBlockTextDecorationStyle(block);

        decorations.push(
          Decoration.mark({
            attributes: {
              class: blockTextClass,
              ...(blockTextStyle ? { style: blockTextStyle } : {}),
            },
          }).range(line.from + textStart, line.to),
        );
      }
    }

    if (shouldDecorateMarker(block)) {
      const marker = block.marker;

      if (marker) {
        const markerStart = line.text.indexOf(marker);

        if (markerStart >= 0) {
          const checkable = block.rule.semanticId === "todo-item"
            ? checkableByLineNumber.get(block.lineNumber)
            : undefined;

          const markerFrom = line.from + markerStart;
          const markerTo = markerFrom + marker.length;

          decorations.push(checkable
            ? Decoration.replace({
                widget: new CtnCheckboxWidget(
                  checkable,
                  onToggleCheckableBlockRef,
                ),
              }).range(markerFrom, markerTo)
            : Decoration.mark({
                attributes: {
                  class: getMarkerDecorationClass(block),
                  ...(getMarkerDecorationStyle(block)
                    ? { style: getMarkerDecorationStyle(block) }
                    : {}),
                },
              }).range(markerFrom, markerTo));
          if (checkable?.recurrenceProgress) {
            decorations.push(
              Decoration.widget({
                side: 1,
                widget: new CtnRecurrenceMarkerWidget(
                  checkable.recurrenceProgress,
                ),
              }).range(markerTo),
            );
          }
        }
      }
    }

    for (const span of block.inlineSpans) {
      const spanStart = line.from + span.startColumn - 1;
      const spanEnd = line.from + span.endColumn - 1;

      if (spanStart >= line.from && spanEnd <= line.to && spanStart < spanEnd) {
        decorations.push(
          Decoration.mark({
            attributes: {
              class: getInlineDecorationClass(span),
              ...(getInlineDecorationStyle(span)
                ? { style: getInlineDecorationStyle(span) }
                : {}),
            },
          }).range(spanStart, spanEnd),
        );
        const sourceText = state.doc.sliceString(spanStart, spanEnd);

        for (const symbol of getInlineSymbolOffsets(span, sourceText)) {
          decorations.push(
            Decoration.mark({
              attributes: {
                class: getInlineSymbolDecorationClass(span),
                ...(getInlineDecorationStyle(span)
                  ? { style: getInlineDecorationStyle(span) }
                  : {}),
              },
            }).range(
              spanStart + symbol.from,
              spanStart + symbol.to,
            ),
          );
        }
      }
    }
  }

  return Decoration.set(decorations, true);
}

export type CtnEditorDecorationPluginValue = {
  analysis: CtnEditorAnalysisState;
  checkableBlocksKey: string;
  decorations: DecorationSet;
};

export type CtnEditorDecorationPlugin =
  ViewPlugin<CtnEditorDecorationPluginValue>;

export function createCtnDecorationPlugin(
  analysisField: CtnEditorAnalysisField,
  onToggleCheckableBlockRef: {
    current: ((blockId: string) => void) | undefined;
  } = { current: undefined },
): CtnEditorDecorationPlugin {
  const getCheckableBlocks = (state: EditorState) =>
    requireCtnEditorRuntimeConfig(
      state.facet(ctnEditorRuntimeConfigFacet),
    ).checkableBlocks;

  return ViewPlugin.fromClass(
    class implements CtnEditorDecorationPluginValue {
      analysis: CtnEditorAnalysisState;
      checkableBlocksKey: string;
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const checkableBlocks = getCheckableBlocks(view.state);
        const analysis = view.state.field(analysisField);

        this.analysis = analysis;
        this.checkableBlocksKey = createCtnEditorCheckableBlocksKey(
          checkableBlocks,
        );
        this.decorations = analysis.analysis
          ? buildCtnDecorations(
              view.state,
              analysis.analysis.document,
              checkableBlocks,
              onToggleCheckableBlockRef,
            )
          : Decoration.none;
      }

      update(update: ViewUpdate) {
        const nextAnalysis = update.state.field(analysisField);
        const checkableBlocks = getCheckableBlocks(update.state);
        const nextCheckableBlocksKey = createCtnEditorCheckableBlocksKey(
          checkableBlocks,
        );

        if (
          nextAnalysis !== this.analysis ||
          nextCheckableBlocksKey !== this.checkableBlocksKey
        ) {
          this.analysis = nextAnalysis;
          this.checkableBlocksKey = nextCheckableBlocksKey;
          this.decorations = nextAnalysis.analysis
            ? buildCtnDecorations(
                update.state,
                nextAnalysis.analysis.document,
                checkableBlocks,
                onToggleCheckableBlockRef,
              )
            : Decoration.none;
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

export function getCtnEditorParsedDocument(
  view: EditorView,
  analysisField: CtnEditorAnalysisField,
) {
  return view.state.field(analysisField).analysis?.document ?? null;
}
