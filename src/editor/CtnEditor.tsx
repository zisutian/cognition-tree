import { useEffect, useRef } from "react";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  type ViewUpdate,
  ViewPlugin,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { parseCtnDocument } from "../ctn/parseOutline";

type CtnEditorProps = {
  focusTarget: CtnEditorFocusTarget | null;
  value: string;
  onChange: (value: string) => void;
};

export type CtnEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

function buildCtnDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  const parsedDocument = parseCtnDocument(view.state.doc.toString());

  for (const block of parsedDocument.blocks) {
    const line = view.state.doc.line(block.lineNumber);
    const lineClasses = ["ctn-line", `ctn-line-${block.type}`];

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

const ctnDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildCtnDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCtnDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

const ctnDiagnosticTooltip = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const parsedDocument = parseCtnDocument(view.state.doc.toString());
  const diagnostics = parsedDocument.diagnostics.filter(
    (diagnostic) => diagnostic.lineNumber === line.number,
  );

  if (diagnostics.length === 0) {
    return null;
  }

  return {
    above: true,
    end: line.to,
    pos: line.from,
    create() {
      const dom = document.createElement("div");
      dom.className = "ctn-diagnostic-tooltip";

      for (const diagnostic of diagnostics) {
        const item = document.createElement("div");
        item.className = "ctn-diagnostic-tooltip-item";
        item.textContent = `L${diagnostic.lineNumber}: ${diagnostic.message}`;
        dom.appendChild(item);
      }

      return { dom };
    },
  };
});

function createEditorExtensions(onChangeRef: {
  current: (value: string) => void;
}): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    highlightActiveLine(),
    indentUnit.of("  "),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    ctnDecorationPlugin,
    ctnDiagnosticTooltip,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": "CTN 原文",
      spellcheck: "false",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    }),
  ];
}

export function CtnEditor({ focusTarget, value, onChange }: CtnEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) {
      return;
    }

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: createEditorExtensions(onChangeRef),
      }),
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view || value === view.state.doc.toString()) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view || !focusTarget) {
      return;
    }

    const clampedLineNumber = Math.max(
      1,
      Math.min(focusTarget.lineNumber, view.state.doc.lines),
    );
    const line = view.state.doc.line(clampedLineNumber);

    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
  }, [focusTarget]);

  return <div className="source-editor" ref={editorHostRef} />;
}
