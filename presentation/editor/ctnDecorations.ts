import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import type {
  CtnEditableBlock,
  CtnEditableDocument,
  CtnInlineSpan,
} from "../../core/ctn/parser/types";
import { createCtnSyntaxParseProfileKey } from "../../core/ctn/syntax/profileKey";
import {
  getCtnEditorTextColorClassName,
  getCtnEditorTextColorStyle,
  getCtnEditorToneClassName,
  getCtnEditorToneStyle,
} from "./ctnTonePresentation";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";
import {
  parseCtnEditorContent,
  type CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks";

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
    checkbox.className = "ctn-todo-checkbox";
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

function isConceptBlock(block: CtnEditableBlock) {
  return block.type === "concept";
}

function getBlockTextClass(block: CtnEditableBlock) {
  const textColorClass = getCtnEditorTextColorClassName(block.textColor);

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
  return `ctn-marker ${getCtnEditorTextColorClassName(block.textColor)}`;
}

export function getBlockLineDecorationClass(
  block: CtnEditableBlock,
  lineNumber = block.lineNumber,
) {
  const lineClasses = ["ctn-line", getCtnEditorToneClassName(block.tone)];
  const isBlockStartLine = lineNumber === block.lineNumber;

  if (isBlockStartLine && block.type === "title") {
    lineClasses.push("ctn-line-title");
  }

  if (isBlockStartLine && isConceptBlock(block)) {
    lineClasses.push("ctn-line-concept");
  }

  if (isBlockStartLine && block.diagnostics.length > 0) {
    lineClasses.push("ctn-line-diagnostic");
  }

  return lineClasses.join(" ");
}

export function getBlockLineDecorationStyle(block: CtnEditableBlock) {
  return getCtnEditorToneStyle(block.tone);
}

export function getInlineDecorationClass(span: CtnInlineSpan) {
  return `ctn-inline ${getCtnEditorToneClassName(span.tone)} ${getCtnEditorTextColorClassName(span.textColor)}`;
}

export function getMarkerDecorationStyle(block: CtnEditableBlock) {
  return getCtnEditorTextColorStyle(block.textColor);
}

export function getMultilineMarkDecorationClass(
  block: CtnEditableBlock,
  lineNumber: number,
) {
  const classes = [
    "ctn-multiline-block-mark",
    getCtnEditorTextColorClassName(block.textColor),
  ];

  if (lineNumber === block.lineNumber) {
    classes.push("ctn-multiline-block-start");
  }

  if (lineNumber === block.multilineRange?.closingFenceLineNumber) {
    classes.push("ctn-multiline-block-end");
  }

  return classes.join(" ");
}

export function getMultilineMarkDecorationStyle(block: CtnEditableBlock) {
  return getCtnEditorTextColorStyle(block.textColor);
}

export function getInlineDecorationStyle(span: CtnInlineSpan) {
  return [
    getCtnEditorToneStyle(span.tone),
    getCtnEditorTextColorStyle(span.textColor),
  ]
    .filter(Boolean)
    .join(" ");
}

function getBlockTextDecorationStyle(block: CtnEditableBlock) {
  return getCtnEditorTextColorStyle(block.textColor);
}

function buildCtnDecorations(
  view: EditorView,
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
      block.role === "multiline" &&
      block.lexicalEndLineNumber > block.lineNumber
    ) {
      for (
        let lineNumber = block.lineNumber;
        lineNumber <= block.lexicalEndLineNumber;
        lineNumber += 1
      ) {
        const multilineLine = view.state.doc.line(lineNumber);
        const multilineTextStart = getLineTextStart(multilineLine.text);
        const multilineMarkStart = multilineLine.from + multilineTextStart;
        const multilineMarkEnd =
          multilineTextStart < multilineLine.text.length
            ? multilineLine.to
            : multilineLine.from + multilineLine.text.length;
        const multilineLineStyle = getCtnEditorToneStyle(block.tone);

        if (lineNumber !== block.lineNumber) {
          decorations.push(
            Decoration.line({
              attributes: {
                class: getBlockLineDecorationClass(block, lineNumber),
                ...(multilineLineStyle ? { style: multilineLineStyle } : {}),
              },
            }).range(multilineLine.from),
          );
        }

        if (multilineMarkStart < multilineMarkEnd) {
          const multilineMarkStyle = getMultilineMarkDecorationStyle(block);

          decorations.push(
            Decoration.mark({
              attributes: {
                class: getMultilineMarkDecorationClass(block, lineNumber),
                ...(multilineMarkStyle ? { style: multilineMarkStyle } : {}),
              },
            }).range(multilineMarkStart, multilineMarkEnd),
          );
        }
      }
    }

    const line = view.state.doc.line(block.lineNumber);
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
          const checkable = block.type === "todo-item"
            ? checkableByLineNumber.get(block.lineNumber)
            : undefined;

          decorations.push(checkable
            ? Decoration.replace({
                widget: new CtnCheckboxWidget(
                  checkable,
                  onToggleCheckableBlockRef,
                ),
              }).range(
                line.from + markerStart,
                line.from + markerStart + marker.length,
              )
            : Decoration.mark({
                attributes: {
                  class: getMarkerDecorationClass(block),
                  ...(getMarkerDecorationStyle(block)
                    ? { style: getMarkerDecorationStyle(block) }
                    : {}),
                },
              }).range(
                line.from + markerStart,
                line.from + markerStart + marker.length,
              ));
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
      }
    }
  }

  return Decoration.set(decorations, true);
}

export type CtnEditorParsePluginValue = {
  checkableBlocksKey: string;
  decorations: DecorationSet;
  document: CtnEditableDocument;
  profileKey: string;
};

export type CtnEditorParsePlugin = ViewPlugin<CtnEditorParsePluginValue>;

function parseEditorDocument(
  view: EditorView,
  syntaxProfile: CtnSyntaxProfile,
  contentMode: CtnEditorParsedContentMode,
) {
  return parseCtnEditorContent(
    view.state.doc.toString(),
    syntaxProfile,
    contentMode,
  );
}

export function createCtnParseDecorationPlugin(
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
  checkableBlocksRef: {
    current: readonly CtnEditorCheckableBlock[];
  } = { current: [] },
  onToggleCheckableBlockRef: {
    current: ((blockId: string) => void) | undefined;
  } = { current: undefined },
): CtnEditorParsePlugin {
  const createCheckableBlocksKey = () => checkableBlocksRef.current
    .map(({ blockId, checked, lineNumber }) =>
      `${lineNumber}:${blockId}:${checked ? "1" : "0"}`
    )
    .join("|");

  return ViewPlugin.fromClass(
    class implements CtnEditorParsePluginValue {
      checkableBlocksKey: string;
      decorations: DecorationSet;
      document: CtnEditableDocument;
      profileKey: string;

      constructor(view: EditorView) {
        this.checkableBlocksKey = createCheckableBlocksKey();
        this.profileKey = createCtnSyntaxParseProfileKey(
          syntaxProfileRef.current,
        );
        this.document = parseEditorDocument(
          view,
          syntaxProfileRef.current,
          contentMode,
        );
        this.decorations = buildCtnDecorations(
          view,
          this.document,
          checkableBlocksRef.current,
          onToggleCheckableBlockRef,
        );
      }

      update(update: ViewUpdate) {
        const nextProfileKey = createCtnSyntaxParseProfileKey(
          syntaxProfileRef.current,
        );
        const nextCheckableBlocksKey = createCheckableBlocksKey();

        if (
          update.docChanged ||
          nextProfileKey !== this.profileKey ||
          nextCheckableBlocksKey !== this.checkableBlocksKey
        ) {
          this.profileKey = nextProfileKey;
          this.checkableBlocksKey = nextCheckableBlocksKey;

          this.document = parseEditorDocument(
            update.view,
            syntaxProfileRef.current,
            contentMode,
          );
          this.decorations = buildCtnDecorations(
            update.view,
            this.document,
            checkableBlocksRef.current,
            onToggleCheckableBlockRef,
          );
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
  parsePlugin: CtnEditorParsePlugin,
) {
  return view.plugin(parsePlugin)?.document ?? null;
}
