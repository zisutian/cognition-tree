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
  type CtnSyntaxProfile,
} from "../ctn/parseOutline";

function syntaxProfileKey(syntaxProfile: CtnSyntaxProfile) {
  return JSON.stringify({
    id: syntaxProfile.id,
    inlineRules: syntaxProfile.inlineRules,
    markerRules: syntaxProfile.markerRules,
    spaceIndentUnit: syntaxProfile.spaceIndentUnit,
    version: syntaxProfile.version,
  });
}

function isRootConceptBlock(block: CtnBlock) {
  return block.level === 0 && block.type === "concept";
}

function getBlockTextClass(block: CtnBlock) {
  if (isRootConceptBlock(block)) {
    return "ctn-block-text ctn-block-text-root-concept";
  }

  return null;
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
  return `ctn-marker ctn-tone-${block.tone}`;
}

export function getInlineDecorationClass(span: CtnInlineSpan) {
  return `ctn-inline ctn-tone-${span.tone}`;
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
    if (block.role === "code" && block.endLineNumber > block.lineNumber) {
      for (
        let lineNumber = block.lineNumber;
        lineNumber <= block.endLineNumber;
        lineNumber += 1
      ) {
        const codeLine = view.state.doc.line(lineNumber);
        const codeMarkClasses = ["ctn-code-block-mark"];
        const codeTextStart = getLineTextStart(codeLine.text);
        const codeMarkStart = codeLine.from + codeTextStart;
        const codeMarkEnd =
          codeTextStart < codeLine.text.length
            ? codeLine.to
            : codeLine.from + codeLine.text.length;

        if (lineNumber === block.lineNumber) {
          codeMarkClasses.push("ctn-code-block-start");
        }

        if (lineNumber === block.endLineNumber) {
          codeMarkClasses.push("ctn-code-block-end");
        }

        if (codeMarkStart < codeMarkEnd) {
          decorations.push(
            Decoration.mark({
              attributes: {
                class: codeMarkClasses.join(" "),
              },
            }).range(codeMarkStart, codeMarkEnd),
          );
        }
      }
    }

    const line = view.state.doc.line(block.lineNumber);
    const lineClasses = ["ctn-line", `ctn-tone-${block.tone}`];

    if (isRootConceptBlock(block)) {
      lineClasses.push("ctn-line-root-concept");
    }

    if (block.diagnostics.length > 0) {
      lineClasses.push("ctn-line-diagnostic");
    }

    const diagnosticTitle = block.diagnostics
      .map((diagnostic) => diagnostic.message)
      .join("\n");

    decorations.push(
      Decoration.line({
        attributes: diagnosticTitle
          ? { class: lineClasses.join(" "), title: diagnosticTitle }
          : { class: lineClasses.join(" ") },
      }).range(line.from),
    );

    const blockTextClass = getBlockTextClass(block);

    if (blockTextClass) {
      const textStart = getBlockTextStart(line.text, block);
      if (textStart < line.text.length) {
        decorations.push(
          Decoration.mark({
            attributes: {
              class: blockTextClass,
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
