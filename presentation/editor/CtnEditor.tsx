import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";
import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import {
  createCtnContentAttributesExtension,
  createCtnEditorExtensions,
  createCtnParsingExtensions,
  createCtnTabSizeExtension,
  ctnContentAttributesCompartment,
  ctnParsingCompartment,
  ctnTabSizeCompartment,
  getCtnEditorActiveLineNumber,
} from "./ctnEditorExtensions";
import type { CtnEditorContentMode } from "./ctnEditorContentMode";
import { createEditorValueSyncTransaction } from "./editorValueSync";
import type { CtnEditorReferenceTarget } from "./ctnReferenceNavigation";
import type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks";
import "./CtnEditor.css";

export type CtnEditorSyntaxProfile = CtnSyntaxProfile;
export type { CtnEditorContentMode } from "./ctnEditorContentMode";

type CtnEditorProps = {
  checkableBlocks?: readonly CtnEditorCheckableBlock[];
  contentMode: CtnEditorContentMode;
  focusTarget: CtnEditorFocusTarget | null;
  syntaxProfile: CtnEditorSyntaxProfile;
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
  syntaxProfile,
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
  const checkableBlocksRef = useRef(checkableBlocks);
  const onToggleCheckableBlockRef = useRef(onToggleCheckableBlock);
  const syntaxProfileRef = useRef(syntaxProfile);
  const tabDisplayWidthRef = useRef(syntaxProfile.tabDisplayWidth);
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
    checkableBlocksRef.current = checkableBlocks;
  }, [checkableBlocks]);

  useEffect(() => {
    onToggleCheckableBlockRef.current = onToggleCheckableBlock;
  }, [onToggleCheckableBlock]);

  useEffect(() => {
    syntaxProfileRef.current = syntaxProfile;
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    if (tabDisplayWidthRef.current !== syntaxProfile.tabDisplayWidth) {
      view.dispatch({
        effects: ctnTabSizeCompartment.reconfigure(
          createCtnTabSizeExtension(syntaxProfile.tabDisplayWidth),
        ),
      });
      tabDisplayWidthRef.current = syntaxProfile.tabDisplayWidth;
      return;
    }

    view.dispatch({});
  }, [syntaxProfile]);

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
          syntaxProfileRef,
          onOpenReferenceRef,
          onActiveLineChangeRef,
          contentMode,
          checkableBlocksRef,
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
  const checkableBlocksKey = checkableBlocks
    .map(({ blockId, checked, lineNumber, recurrenceLabel }) =>
      `${lineNumber}:${blockId}:${checked ? "1" : "0"}:${recurrenceLabel ?? ""}`
    )
    .join("|");

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
      effects: ctnParsingCompartment.reconfigure(
        createCtnParsingExtensions(
          syntaxProfileRef,
          onOpenReferenceRef,
          contentMode,
          checkableBlocksRef,
          onToggleCheckableBlockRef,
        ),
      ),
    });
    view.dispatch({
      effects: ctnContentAttributesCompartment.reconfigure(
        createCtnContentAttributesExtension(contentMode),
      ),
    });
  }, [bodyTitle, checkableBlocksKey, contentModeKind]);

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
