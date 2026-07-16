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
import { Compartment, EditorState, type Extension } from "@codemirror/state";
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
import type { CtnEditableSourceChange } from "../ctn/metadata/textEdits";
import { createCtnParseDecorationPlugin } from "./ctnDecorations";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip";
import {
  createCtnReferenceNavigationExtension,
  type CtnEditorReferenceTarget,
} from "./ctnReferenceNavigation";
import { createCtnCodeBlockEditingExtensions } from "./ctnCodeBlockEditing";
import { createEditorCompositionChange } from "./editorCompositionChange";
import { ctnExternalValueSync } from "./editorValueSync";

export const ctnTabSizeCompartment = new Compartment();
export const ctnParsingCompartment = new Compartment();

export function createCtnIndentUnit() {
  return "\t";
}

export function createCtnIndentUnitExtension() {
  return indentUnit.of(createCtnIndentUnit());
}

export function createCtnTabSizeExtension(tabDisplayWidth: number) {
  return EditorState.tabSize.of(Math.max(1, Math.floor(tabDisplayWidth)));
}

export function getCtnEditorActiveLineNumber(state: EditorState) {
  return state.doc.lineAt(state.selection.main.head).number;
}

export function createCtnEditorExtensions(
  onChangeRef: {
    current: (change: CtnEditableSourceChange) => void;
  },
  syntaxProfileRef: {
    current: CtnSyntaxProfile;
  },
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
  onActiveLineChangeRef: {
    current: (lineNumber: number) => void;
  },
  mode: "ctn" | "raw" = "ctn",
): Extension[] {
  const compositionChange = createEditorCompositionChange({
    onChange: (value) => onChangeRef.current(value),
  });

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
    ctnParsingCompartment.of(
      createCtnParsingExtensions(
        syntaxProfileRef,
        onOpenReferenceRef,
        mode,
      ),
    ),
    EditorView.contentAttributes.of({
      "aria-label": "CTN 原文",
      spellcheck: "false",
    }),
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        compositionChange.handleCompositionEnd(() => view.state.doc.toString());
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      const isExternalValueSync = update.transactions.some((transaction) =>
        transaction.annotation(ctnExternalValueSync),
      );

      if (update.docChanged) {
        compositionChange.handleDocumentChange({
          changes: update.changes,
          isComposing: update.view.composing,
          isExternal: isExternalValueSync,
          source: update.state.doc.toString(),
        });
      }

      if (update.docChanged || update.selectionSet) {
        onActiveLineChangeRef.current(
          getCtnEditorActiveLineNumber(update.state),
        );
      }
    }),
  ];
}

export function createCtnParsingExtensions(
  syntaxProfileRef: { current: CtnSyntaxProfile },
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
  mode: "ctn" | "raw",
): Extension[] {
  if (mode === "raw") {
    return [];
  }

  const parseDecorationPlugin = createCtnParseDecorationPlugin(syntaxProfileRef);

  return [
    parseDecorationPlugin,
    createCtnDiagnosticTooltip(parseDecorationPlugin),
    createCtnReferenceNavigationExtension(
      parseDecorationPlugin,
      onOpenReferenceRef,
    ),
    ...createCtnCodeBlockEditingExtensions(parseDecorationPlugin),
  ];
}
