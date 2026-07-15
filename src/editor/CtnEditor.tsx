import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CtnSyntaxProfile } from "../ctn/syntax/types";
import {
  createCtnEditorExtensions,
  createCtnTabSizeExtension,
  ctnExternalValueSync,
  ctnTabSizeCompartment,
} from "./ctnEditorExtensions";
import { createEditorValueSyncChange } from "./editorValueSync";
import "./CtnEditor.css";

export type CtnEditorSyntaxProfile = CtnSyntaxProfile;

type CtnEditorProps = {
  focusTarget: CtnEditorFocusTarget | null;
  syntaxProfile: CtnEditorSyntaxProfile;
  value: string;
  onChange: (value: string) => void;
};

export type CtnEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export function CtnEditor({
  focusTarget,
  syntaxProfile,
  value,
  onChange,
}: CtnEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const syntaxProfileRef = useRef(syntaxProfile);
  const tabDisplayWidthRef = useRef(syntaxProfile.tabDisplayWidth);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
        extensions: createCtnEditorExtensions(onChangeRef, syntaxProfileRef),
      }),
    });

    editorViewRef.current = view;

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

    const change = createEditorValueSyncChange(
      view.state.doc.toString(),
      value,
    );

    if (!change) {
      return;
    }

    view.dispatch({
      annotations: ctnExternalValueSync.of(true),
      changes: change,
    });
  }, [value]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view || !focusTarget) {
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
  }, [focusTarget]);

  return <div className="source-editor" ref={editorHostRef} />;
}
