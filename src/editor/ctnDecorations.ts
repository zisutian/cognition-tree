import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import {
  parseCtnDocument,
  type CtnBlock,
  type CtnInlineSpan,
} from "../ctn/parseOutline";
import {
  getSyntaxTextColorClassName,
  getSyntaxTextColorStyle,
  getSyntaxToneClassName,
  getSyntaxToneStyle,
} from "../syntax/tones";
import type { CtnSyntaxProfile } from "../syntax/types";

function syntaxProfileKey(syntaxProfile: CtnSyntaxProfile) {
  return JSON.stringify({
    conceptRule: syntaxProfile.conceptRule,
    inlineRules: syntaxProfile.inlineRules,
    markerRules: syntaxProfile.markerRules,
  });
}

function isRootConceptBlock(block: CtnBlock) {
  return block.level === 0 && block.marker === null;
}

function getBlockTextClass(block: CtnBlock) {
  const textColorClass = getSyntaxTextColorClassName(block.textColor);

  if (isRootConceptBlock(block)) {
    return `ctn-block-text ctn-block-text-root-concept ${textColorClass}`;
  }

  return `ctn-block-text ${textColorClass}`;
}

function getBlockTextStart(lineText: string, block: CtnBlock) {
  let textStart = block.indentText.length;

  if (block.marker) {
    const markerStart = lineText.indexOf(block.marker);

    if (markerStart >= 0) {
      textStart = markerStart + block.marker.length;
    }
  }

  while (textStart < lineText.length && /\s/.test(lineText[textStart])) {
    textStart += 1;
  }

  return textStart;
}

function getLineTextStart(lineText: string) {
  return lineText.match(/^\s*/)?.[0].length ?? 0;
}

export function shouldDecorateMarker(block: CtnBlock) {
  return (
    block.marker !== null &&
    !block.diagnostics.some((diagnostic) => diagnostic.code === "unknown-marker")
  );
}

export function getMarkerDecorationClass(block: CtnBlock) {
  return `ctn-marker ${getSyntaxTextColorClassName(block.textColor)}`;
}

export function getBlockLineDecorationClass(
  block: CtnBlock,
  lineNumber = block.lineNumber,
) {
  const lineClasses = ["ctn-line", getSyntaxToneClassName(block.tone)];
  const isBlockStartLine = lineNumber === block.lineNumber;

  if (isBlockStartLine && isRootConceptBlock(block)) {
    lineClasses.push("ctn-line-root-concept");
  }

  if (isBlockStartLine && block.diagnostics.length > 0) {
    lineClasses.push("ctn-line-diagnostic");
  }

  return lineClasses.join(" ");
}

export function getBlockLineDecorationStyle(block: CtnBlock) {
  return getSyntaxToneStyle(block.tone);
}

export function getInlineDecorationClass(span: CtnInlineSpan) {
  return `ctn-inline ${getSyntaxToneClassName(span.tone)} ${getSyntaxTextColorClassName(span.textColor)}`;
}

export function getMarkerDecorationStyle(block: CtnBlock) {
  return getSyntaxTextColorStyle(block.textColor);
}

export function getMultilineMarkDecorationClass(
  block: CtnBlock,
  lineNumber: number,
) {
  const classes = [
    "ctn-multiline-block-mark",
    getSyntaxTextColorClassName(block.textColor),
  ];

  if (lineNumber === block.lineNumber) {
    classes.push("ctn-multiline-block-start");
  }

  if (lineNumber === block.endLineNumber) {
    classes.push("ctn-multiline-block-end");
  }

  return classes.join(" ");
}

export function getMultilineMarkDecorationStyle(block: CtnBlock) {
  return getSyntaxTextColorStyle(block.textColor);
}

export function getInlineDecorationStyle(span: CtnInlineSpan) {
  return [getSyntaxToneStyle(span.tone), getSyntaxTextColorStyle(span.textColor)]
    .filter(Boolean)
    .join(" ");
}

function getBlockTextDecorationStyle(block: CtnBlock) {
  return getSyntaxTextColorStyle(block.textColor);
}

function buildCtnDecorations(
  view: EditorView,
  syntaxProfile: CtnSyntaxProfile,
): DecorationSet {
  const decorations = [];
  const parsedDocument = parseCtnDocument(view.state.doc.toString(), {
    syntaxProfile,
  });

  for (const block of parsedDocument.blocks) {
    if (block.role === "multiline" && block.endLineNumber > block.lineNumber) {
      for (
        let lineNumber = block.lineNumber;
        lineNumber <= block.endLineNumber;
        lineNumber += 1
      ) {
        const multilineLine = view.state.doc.line(lineNumber);
        const multilineTextStart = getLineTextStart(multilineLine.text);
        const multilineMarkStart = multilineLine.from + multilineTextStart;
        const multilineMarkEnd =
          multilineTextStart < multilineLine.text.length
            ? multilineLine.to
            : multilineLine.from + multilineLine.text.length;
        const multilineLineStyle = getSyntaxToneStyle(block.tone);

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
      const textStart = getBlockTextStart(line.text, block);
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

export function createCtnDecorationPlugin(syntaxProfileRef: {
  current: CtnSyntaxProfile;
}) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      profileKey: string;

      constructor(view: EditorView) {
        this.profileKey = syntaxProfileKey(syntaxProfileRef.current);
        this.decorations = buildCtnDecorations(view, syntaxProfileRef.current);
      }

      update(update: ViewUpdate) {
        const nextProfileKey = syntaxProfileKey(syntaxProfileRef.current);

        if (
          update.docChanged ||
          update.viewportChanged ||
          nextProfileKey !== this.profileKey
        ) {
          this.profileKey = nextProfileKey;
          this.decorations = buildCtnDecorations(
            update.view,
            syntaxProfileRef.current,
          );
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
