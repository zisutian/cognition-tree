import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CtnSyntaxProfile } from "../ctn/syntax/types";
import type { CtnEditableSourceChange } from "../ctn/metadata/textEdits";
import {
  createCtnEditorExtensions,
  createCtnParsingExtensions,
  createCtnTabSizeExtension,
  ctnParsingCompartment,
  ctnTabSizeCompartment,
  getCtnEditorActiveLineNumber,
} from "./ctnEditorExtensions";
import { createEditorValueSyncTransaction } from "./editorValueSync";
import type { CtnEditorReferenceTarget } from "./ctnReferenceNavigation";
import "./CtnEditor.css";

export type CtnEditorSyntaxProfile = CtnSyntaxProfile;

type CtnEditorProps = {
  focusTarget: CtnEditorFocusTarget | null;
  mode?: "ctn" | "raw";
  syntaxProfile: CtnEditorSyntaxProfile;
  value: string;
  onActiveLineChange: (lineNumber: number) => void;
  onChange: (change: CtnEditableSourceChange) => void;
  onConsumeFocusTarget: (requestId: number) => void;
  onOpenReference?: (target: CtnEditorReferenceTarget) => void;
};

export type CtnEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export function CtnEditor({
  focusTarget,
  mode = "ctn",
  syntaxProfile,
  value,
  onActiveLineChange,
  onChange,
  onConsumeFocusTarget,
  onOpenReference,
}: CtnEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onChangeRef = useRef(onChange);
  const onOpenReferenceRef = useRef(onOpenReference);
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
          mode,
        ),
      }),
    });

    editorViewRef.current = view;
    onActiveLineChangeRef.current(getCtnEditorActiveLineNumber(view.state));

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

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
  }, [value]);

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
          mode,
        ),
      ),
    });
  }, [mode]);

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
      data-editor-mode={mode}
      ref={editorHostRef}
    />
  );
}
