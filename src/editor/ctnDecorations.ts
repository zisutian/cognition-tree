import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import { parseCtnEditableDocument } from "../ctn/parser/parseCtnDocument";
import type {
  CtnEditableBlock,
  CtnEditableDocument,
  CtnInlineSpan,
} from "../ctn/parser/types";
import { createCtnSyntaxParseProfileKey } from "../ctn/syntax/profileKey";
import {
  getCtnEditorTextColorClassName,
  getCtnEditorTextColorStyle,
  getCtnEditorToneClassName,
  getCtnEditorToneStyle,
} from "./ctnTonePresentation";
import type { CtnSyntaxProfile } from "../ctn/syntax/types";

function isRootConceptBlock(block: CtnEditableBlock) {
  return block.level === 0 && block.marker === null;
}

function getBlockTextClass(block: CtnEditableBlock) {
  const textColorClass = getCtnEditorTextColorClassName(block.textColor);

  if (isRootConceptBlock(block)) {
    return `ctn-block-text ctn-block-text-root-concept ${textColorClass}`;
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

  if (isBlockStartLine && isRootConceptBlock(block)) {
    lineClasses.push("ctn-line-root-concept");
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
): DecorationSet {
  const decorations = [];

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
          decorations.push(
            Decoration.mark({
              attributes: {
                class: getMarkerDecorationClass(block),
                ...(getMarkerDecorationStyle(block)
                  ? { style: getMarkerDecorationStyle(block) }
                  : {}),
              },
            }).range(
              line.from + markerStart,
              line.from + markerStart + marker.length,
            ),
          );
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
  decorations: DecorationSet;
  document: CtnEditableDocument;
  profileKey: string;
};

export type CtnEditorParsePlugin = ViewPlugin<CtnEditorParsePluginValue>;

function parseEditorDocument(
  view: EditorView,
  syntaxProfile: CtnSyntaxProfile,
) {
  return parseCtnEditableDocument(
    view.state.doc.toString(),
    syntaxProfile,
  );
}

export function createCtnParseDecorationPlugin(syntaxProfileRef: {
  current: CtnSyntaxProfile;
}): CtnEditorParsePlugin {
  return ViewPlugin.fromClass(
    class implements CtnEditorParsePluginValue {
      decorations: DecorationSet;
      document: CtnEditableDocument;
      profileKey: string;

      constructor(view: EditorView) {
        this.profileKey = createCtnSyntaxParseProfileKey(
          syntaxProfileRef.current,
        );
        this.document = parseEditorDocument(view, syntaxProfileRef.current);
        this.decorations = buildCtnDecorations(view, this.document);
      }

      update(update: ViewUpdate) {
        const nextProfileKey = createCtnSyntaxParseProfileKey(
          syntaxProfileRef.current,
        );

        if (update.docChanged || nextProfileKey !== this.profileKey) {
          this.profileKey = nextProfileKey;

          this.document = parseEditorDocument(
            update.view,
            syntaxProfileRef.current,
          );
          this.decorations = buildCtnDecorations(update.view, this.document);
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
