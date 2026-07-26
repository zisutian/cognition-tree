import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CtnCompiledSyntax } from "../../core/ctn/syntax/types";
import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import {
  createCtnEditorExtensions,
  createCtnEditorRuntimeExtensions,
  ctnEditorRuntimeCompartment,
  getCtnEditorActiveLineNumber,
} from "./ctnEditorExtensions";
import type { CtnEditorContentMode } from "./ctnEditorContentMode";
import { createEditorValueSyncTransaction } from "./editorValueSync";
import type { CtnEditorReferenceTarget } from "./ctnReferenceNavigation";
import {
  createCtnEditorCheckableBlocksKey,
  type CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks";
import "./CtnEditor.css";

export type CtnEditorSyntax = CtnCompiledSyntax;
export type { CtnEditorContentMode } from "./ctnEditorContentMode";

type CtnEditorProps = {
  checkableBlocks?: readonly CtnEditorCheckableBlock[];
  contentMode: CtnEditorContentMode;
  focusTarget: CtnEditorFocusTarget | null;
  syntax: CtnEditorSyntax;
  value: string;
  valueSyncVersion?: number;
  onActiveLineChange: (lineNumber: number) => void;
  onChange: (change: CtnEditableSourceChange) => void;
  onConsumeFocusTarget: (requestId: number) => void;
  onOpenReference?: (target: CtnEditorReferenceTarget) => void;
  onToggleCheckableBlock?: (blockId: string) => void;
};

export type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks";

export type CtnEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export function CtnEditor({
  checkableBlocks = [],
  contentMode,
  focusTarget,
  syntax,
  value,
  valueSyncVersion = 0,
  onActiveLineChange,
  onChange,
  onConsumeFocusTarget,
  onOpenReference,
  onToggleCheckableBlock,
}: CtnEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onChangeRef = useRef(onChange);
  const onOpenReferenceRef = useRef(onOpenReference);
  const onToggleCheckableBlockRef = useRef(onToggleCheckableBlock);
  const consumedFocusRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    onActiveLineChangeRef.current = onActiveLineChange;
  }, [onActiveLineChange]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onOpenReferenceRef.current = onOpenReference;
  }, [onOpenReference]);

  useEffect(() => {
    onToggleCheckableBlockRef.current = onToggleCheckableBlock;
  }, [onToggleCheckableBlock]);

  useEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) {
      return;
    }

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: createCtnEditorExtensions(
          onChangeRef,
          syntax,
          onOpenReferenceRef,
          onActiveLineChangeRef,
          contentMode,
          checkableBlocks,
          onToggleCheckableBlockRef,
        ),
      }),
    });

    editorViewRef.current = view;
    onActiveLineChangeRef.current(getCtnEditorActiveLineNumber(view.state));

    return () => {
      view.destroy();
      editorViewRef.current = null;
      consumedFocusRequestIdRef.current = null;
    };
  }, []);

  const contentModeKind = contentMode.kind;
  const bodyTitle = contentMode.kind === "body" ? contentMode.title : null;
  const checkableBlocksKey = createCtnEditorCheckableBlocksKey(
    checkableBlocks,
  );

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    const transaction = createEditorValueSyncTransaction(
      view.state.doc.toString(),
      value,
    );

    if (!transaction) {
      return;
    }

    view.dispatch(transaction);
  }, [value, valueSyncVersion]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: ctnEditorRuntimeCompartment.reconfigure(
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [...checkableBlocks],
          contentMode,
          syntax,
        }),
      ),
    });
  }, [
    bodyTitle,
    checkableBlocksKey,
    contentModeKind,
    syntax.analysisKey,
    syntax.presentationKey,
  ]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (
      !view ||
      !focusTarget ||
      consumedFocusRequestIdRef.current === focusTarget.requestId
    ) {
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
    consumedFocusRequestIdRef.current = focusTarget.requestId;
    onConsumeFocusTarget(focusTarget.requestId);
  }, [focusTarget, onConsumeFocusTarget]);

  return (
    <div
      className="source-editor"
      data-editor-mode={contentMode.kind}
      ref={editorHostRef}
    />
  );
}
