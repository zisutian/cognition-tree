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
  type ViewUpdate,
  ViewPlugin,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { parseCtnDocument } from "./ctn/parseOutline";

type CtnEditorProps = {
  value: string;
  onChange: (value: string) => void;
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

    decorations.push(
      Decoration.line({
        attributes: { class: lineClasses.join(" ") },
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

export function CtnEditor({ value, onChange }: CtnEditorProps) {
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

  return <div className="source-editor" ref={editorHostRef} />;
}
