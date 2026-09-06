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
import type { CtnEditableSourceChange } from "../../core/ctn/index.ts";
import { createCtnDecorationPlugin } from "./ctnDecorations.ts";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip.ts";
import {
  createCtnReferenceNavigationExtension,
  type CtnEditorReferenceTarget,
} from "./ctnReferenceNavigation.ts";
import { createEditorCompositionChange } from "./editorCompositionChange.ts";
import { ctnExternalValueSync } from "./editorValueSync.ts";
import type { CtnEditorContentMode } from "./ctnEditorContentMode.ts";
import {
  createCtnEditorAnalysisField,
  type CtnEditorAnalysisField,
} from "./ctnEditorAnalysis.ts";
import {
  createCtnEditorRuntimeConfig,
  ctnEditorRuntimeCompartment,
  ctnEditorRuntimeConfigFacet,
  type CtnEditorRuntimeOptions,
} from "./ctnEditorRuntime.ts";

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

export const ctnEditorReadOnlyCompartment = new Compartment();

export function createCtnEditorReadOnlyExtensions(readOnly: boolean) {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
}

export function createCtnEditorRuntimeExtensions(
  options: CtnEditorRuntimeOptions,
): Extension[] {
  const configuration = createCtnEditorRuntimeConfig(options);

  return [
    ctnEditorRuntimeConfigFacet.of(configuration),
    createCtnTabSizeExtension(
      configuration.tabDisplayWidth,
    ),
    createCtnContentAttributesExtension(
      configuration.contentMode,
    ),
  ];
}

export function createCtnEditorExtensions(
  onChangeRef: {
    current: (change: CtnEditableSourceChange) => void;
  },
  runtimeOptions: CtnEditorRuntimeOptions,
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
  onActiveLineChangeRef: {
    current: (lineNumber: number) => void;
  },
  onToggleCheckableBlockRef?: {
    current: ((blockId: string) => void) | undefined;
  },
  readOnly = false,
): Extension[] {
  const compositionChange = createEditorCompositionChange({
    onChange: (value) => onChangeRef.current(value),
  });
  const analysisField = createCtnEditorAnalysisField();

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
    ctnEditorRuntimeCompartment.of(
      createCtnEditorRuntimeExtensions({
        ...runtimeOptions,
        checkableBlocks: [...runtimeOptions.checkableBlocks],
      }),
    ),
    ctnEditorReadOnlyCompartment.of(
      createCtnEditorReadOnlyExtensions(readOnly),
    ),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    analysisField,
    ...createCtnParsingExtensions(
      analysisField,
      onOpenReferenceRef,
      onToggleCheckableBlockRef,
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
  analysisField: CtnEditorAnalysisField,
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
  onToggleCheckableBlockRef?: {
    current: ((blockId: string) => void) | undefined;
  },
): Extension[] {
  const decorationPlugin = createCtnDecorationPlugin(
    analysisField,
    onToggleCheckableBlockRef,
  );

  return [
    decorationPlugin,
    createCtnDiagnosticTooltip(analysisField),
    createCtnReferenceNavigationExtension(
      analysisField,
      onOpenReferenceRef,
    ),
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
