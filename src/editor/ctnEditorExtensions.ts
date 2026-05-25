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
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import type { CtnSyntaxProfile } from "../ctn/parseOutline";
import { createCtnDecorationPlugin } from "./ctnDecorations";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip";

export function createCtnEditorExtensions(
  onChangeRef: {
    current: (value: string) => void;
  },
  syntaxProfileRef: {
    current: CtnSyntaxProfile;
  },
): Extension[] {
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
    indentUnit.of("    "),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    createCtnDecorationPlugin(syntaxProfileRef),
    createCtnDiagnosticTooltip(syntaxProfileRef),
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
