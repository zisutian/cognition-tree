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
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import type { CtnEditableSourceChange } from "../../ctn/metadata/textEdits";
import { createCtnParseDecorationPlugin } from "./ctnDecorations";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip";
import {
  createCtnReferenceNavigationExtension,
  type CtnEditorReferenceTarget,
} from "./ctnReferenceNavigation";
import { createCtnCodeBlockEditingExtensions } from "./ctnCodeBlockEditing";
import { createEditorCompositionChange } from "./editorCompositionChange";
import { ctnExternalValueSync } from "./editorValueSync";
import type { CtnEditorContentMode } from "./ctnEditorContentMode";
import type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks";

export const ctnTabSizeCompartment = new Compartment();
export const ctnParsingCompartment = new Compartment();
export const ctnContentAttributesCompartment = new Compartment();

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
  contentMode: CtnEditorContentMode,
  checkableBlocksRef?: {
    current: readonly CtnEditorCheckableBlock[];
  },
  onToggleCheckableBlockRef?: {
    current: ((blockId: string) => void) | undefined;
  },
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
        contentMode,
        checkableBlocksRef,
        onToggleCheckableBlockRef,
      ),
    ),
    ctnContentAttributesCompartment.of(
      createCtnContentAttributesExtension(contentMode),
    ),
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
  contentMode: CtnEditorContentMode,
  checkableBlocksRef?: {
    current: readonly CtnEditorCheckableBlock[];
  },
  onToggleCheckableBlockRef?: {
    current: ((blockId: string) => void) | undefined;
  },
): Extension[] {
  if (contentMode.kind === "raw") {
    return [];
  }

  const parseDecorationPlugin = createCtnParseDecorationPlugin(
    syntaxProfileRef,
    contentMode,
    checkableBlocksRef,
    onToggleCheckableBlockRef,
  );

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

export function createCtnContentAttributesExtension(
  contentMode: CtnEditorContentMode,
) {
  return EditorView.contentAttributes.of({
    "aria-label": contentMode.kind === "body" ? "CTN 正文" : "CTN 原文",
    spellcheck: "false",
  });
}
