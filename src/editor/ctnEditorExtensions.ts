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
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state";
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
import type { CtnSyntaxProfile } from "../ctn/syntax/types";
import { createCtnParseDecorationPlugin } from "./ctnDecorations";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip";

export const ctnTabSizeCompartment = new Compartment();
export const ctnExternalValueSync = Annotation.define<boolean>();

export function createCtnIndentUnit() {
  return "\t";
}

export function createCtnIndentUnitExtension() {
  return indentUnit.of(createCtnIndentUnit());
}

export function createCtnTabSizeExtension(tabDisplayWidth: number) {
  return EditorState.tabSize.of(Math.max(1, Math.floor(tabDisplayWidth)));
}

export function createCtnEditorExtensions(
  onChangeRef: {
    current: (value: string) => void;
  },
  syntaxProfileRef: {
    current: CtnSyntaxProfile;
  },
): Extension[] {
  const parseDecorationPlugin = createCtnParseDecorationPlugin(syntaxProfileRef);

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
    createCtnIndentUnitExtension(),
    ctnTabSizeCompartment.of(
      createCtnTabSizeExtension(syntaxProfileRef.current.tabDisplayWidth),
    ),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    parseDecorationPlugin,
    createCtnDiagnosticTooltip(parseDecorationPlugin),
    EditorView.contentAttributes.of({
      "aria-label": "CTN 原文",
      spellcheck: "false",
    }),
    EditorView.updateListener.of((update) => {
      const isExternalValueSync = update.transactions.some((transaction) =>
        transaction.annotation(ctnExternalValueSync),
      );

      if (update.docChanged && !isExternalValueSync) {
        onChangeRef.current(update.state.doc.toString());
      }
    }),
  ];
}
