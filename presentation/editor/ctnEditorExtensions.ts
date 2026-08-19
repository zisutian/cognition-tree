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
import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import { createCtnDecorationPlugin } from "./ctnDecorations";
import { createCtnDiagnosticTooltip } from "./ctnDiagnosticTooltip";
import {
  createCtnReferenceNavigationExtension,
  type CtnEditorReferenceTarget,
} from "./ctnReferenceNavigation";
import { createEditorCompositionChange } from "./editorCompositionChange";
import { ctnExternalValueSync } from "./editorValueSync";
import type { CtnEditorContentMode } from "./ctnEditorContentMode";
import {
  createCtnEditorAnalysisField,
  type CtnEditorAnalysisField,
} from "./ctnEditorAnalysis";
import {
  createCtnEditorRuntimeConfig,
  ctnEditorRuntimeCompartment,
  ctnEditorRuntimeConfigFacet,
  type CtnEditorRuntimeOptions,
} from "./ctnEditorRuntime";

export { ctnEditorRuntimeCompartment } from "./ctnEditorRuntime";

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
