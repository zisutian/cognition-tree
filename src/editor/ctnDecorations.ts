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
  type CtnSyntaxProfile,
} from "../ctn/parseOutline";

function syntaxProfileKey(syntaxProfile: CtnSyntaxProfile) {
  return `${syntaxProfile.id}@${syntaxProfile.version}`;
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

function buildCtnDecorations(
  view: EditorView,
  syntaxProfile: CtnSyntaxProfile,
): DecorationSet {
  const decorations = [];
  const parsedDocument = parseCtnDocument(view.state.doc.toString(), {
    syntaxProfile,
  });

  for (const block of parsedDocument.blocks) {
    const line = view.state.doc.line(block.lineNumber);
    const lineClasses = ["ctn-line", `ctn-line-${block.type}`];

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

    if (block.marker) {
      const markerStart = line.text.indexOf(block.marker);

      if (markerStart >= 0) {
        decorations.push(
          Decoration.mark({
            attributes: {
              class: `ctn-marker ctn-marker-${block.type}`,
            },
          }).range(
            line.from + markerStart,
            line.from + markerStart + block.marker.length,
          ),
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
