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
import {
  createCtnReferenceNavigationExtension,
  type CtnEditorReferenceTarget,
} from "./ctnReferenceNavigation";
import { createCtnCodeBlockEditingExtensions } from "./ctnCodeBlockEditing";
import { createEditorCompositionChange } from "./editorCompositionChange";

export const ctnTabSizeCompartment = new Compartment();
export const ctnParsingCompartment = new Compartment();
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
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
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
          isComposing: update.view.composing,
          isExternal: isExternalValueSync,
          value: update.state.doc.toString(),
        });
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
