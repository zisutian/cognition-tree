import {
  ctnCheckboxBridgeFacet,
  useCtnCheckboxBridge,
} from "./ctnCheckboxBridge.tsx";
import { usePageNavigation } from "../navigation/index.ts";
import { useEffect, useLayoutEffect, useRef } from "react";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type {
  CtnCompiledSyntax,
  CtnEditableSourceChange,
} from "../../core/ctn/index.ts";

import {
  createCtnEditorReadOnlyExtensions,
  createCtnEditorExtensions,
  createCtnEditorRuntimeExtensions,
  ctnEditorReadOnlyCompartment,
  getCtnEditorActiveLineNumber,
} from "./ctnEditorExtensions.ts";
import type { CtnEditorParsedContentMode } from "./ctnEditorContentMode.ts";
import {
  ctnEditorRuntimeCompartment,
  type CtnEditorRuntimeOptions,
} from "./ctnEditorRuntime.ts";
import { createEditorValueSyncTransaction } from "./editorValueSync.ts";
import type { CtnEditorReferenceTarget } from "./ctnReferenceNavigation.ts";
import {
  createCtnEditorCheckableBlocksKey,
  type CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks.ts";
import "./CtnEditor.css";

export type CtnEditorSyntax = CtnCompiledSyntax;
export type { CtnEditorContentMode } from "./ctnEditorContentMode.ts";

type CtnEditorBaseProps = {
  sessionKey?: string;
  checkableBlocks?: readonly CtnEditorCheckableBlock[];
  focusTarget: CtnEditorFocusTarget | null;
  value: string;
  valueSyncVersion?: number;
  onActiveLineChange: (lineNumber: number, source: string, isComposing: boolean) => void;
  onBlur?: (source: string, isComposing: boolean) => void;
  onChange: (change: CtnEditableSourceChange) => void;
  onConsumeFocusTarget: (requestId: number) => void;
  onOpenReference?: (target: CtnEditorReferenceTarget) => void;
  onToggleCheckableBlock?: (blockId: string) => void;
  readOnly?: boolean;
};

type CtnEditorProps = CtnEditorBaseProps &
  (
    | {
        contentMode: { kind: "raw" };
        syntax: null;
        tabDisplayWidth: number;
      }
    | {
        contentMode: CtnEditorParsedContentMode;
        syntax: CtnEditorSyntax;
      }
  );

export type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks.ts";

export type CtnEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

function createRuntimeOptions(
  props: CtnEditorProps,
  checkableBlocks: readonly CtnEditorCheckableBlock[],
): CtnEditorRuntimeOptions {
  return props.syntax === null
    ? {
        checkableBlocks,
        contentMode: props.contentMode,
        syntax: null,
        tabDisplayWidth: props.tabDisplayWidth,
      }
    : {
        checkableBlocks,
        contentMode: props.contentMode,
        syntax: props.syntax,
      };
}

export function CtnEditor(props: CtnEditorProps) {
  const {
    checkableBlocks = [],
    contentMode,
    focusTarget,
    syntax,
    value,
    valueSyncVersion = 0,
    onActiveLineChange,
    onBlur,
    onChange,
    onConsumeFocusTarget,
    onOpenReference,
    onToggleCheckableBlock,
    readOnly = false,
  } = props;
  const widgets = useCtnCheckboxBridge();
  const pageNavigation = usePageNavigation();
  const sessionKey = props.sessionKey;
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onBlurRef = useRef(onBlur);
  const isCompositionPendingRef = useRef<() => boolean>(() => false);
  const onChangeRef = useRef(onChange);
  const onOpenReferenceRef = useRef(onOpenReference);
  const onToggleCheckableBlockRef = useRef(onToggleCheckableBlock);
  const consumedFocusRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    onActiveLineChangeRef.current = onActiveLineChange;
  }, [onActiveLineChange]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onOpenReferenceRef.current = onOpenReference;
  }, [onOpenReference]);

  useEffect(() => {
    onToggleCheckableBlockRef.current = readOnly
      ? undefined
      : onToggleCheckableBlock;
  }, [onToggleCheckableBlock, readOnly]);

  useLayoutEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) {
      return;
    }

    const extensions = createCtnEditorExtensions(
      onChangeRef,
      createRuntimeOptions(props, checkableBlocks),
      onOpenReferenceRef,
      onActiveLineChangeRef,
      onBlurRef,
      isCompositionPendingRef,
      onToggleCheckableBlockRef,
      readOnly,
    );
    extensions.push(ctnCheckboxBridgeFacet.of(widgets.bridge));
    const saved = sessionKey
      ? pageNavigation.viewSessions.read<{
          state: EditorState;
          top: number;
          left: number;
          scroll: ReturnType<EditorView["scrollSnapshot"]>;
        }>(sessionKey)
      : undefined;
    let state = saved
      ? saved.state.update({ effects: StateEffect.reconfigure.of(extensions) })
          .state
      : EditorState.create({ doc: initialValueRef.current, extensions });
    const sync = createEditorValueSyncTransaction(
      state.doc.toString(),
      initialValueRef.current,
    );
    if (sync) state = state.update(sync).state;
    const view = new EditorView({
      parent: editorHostRef.current,
      state,
      scrollTo: saved?.scroll,
    });

    let measured = false;
    let restoreFrame: number | undefined;
    view.requestMeasure({
      read: () => null,
      write: () => {
        // Apply the pixel offset after CodeMirror has resolved its initial scroll anchor.
        restoreFrame = requestAnimationFrame(() => {
          if (saved && !focusTarget) {
            view.scrollDOM.scrollTop = saved.top;
            view.scrollDOM.scrollLeft = saved.left;
          }
          measured = true;
        });
      },
    });
    editorViewRef.current = view;
    onActiveLineChangeRef.current(
      getCtnEditorActiveLineNumber(view.state),
      view.state.doc.toString(),
      view.composing,
    );

    return () => {
      onBlurRef.current?.(
        view.state.doc.toString(),
        view.composing || isCompositionPendingRef.current(),
      );
      if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
      if (
        sessionKey &&
        pageNavigation
          .getSnapshot()
          .pages.some((page) => page.key === sessionKey)
      )
        pageNavigation.viewSessions.write(sessionKey, {
          state: view.state,
          top: measured
            ? view.scrollDOM.scrollTop
            : (saved?.top ?? view.scrollDOM.scrollTop),
          left: measured
            ? view.scrollDOM.scrollLeft
            : (saved?.left ?? view.scrollDOM.scrollLeft),
          scroll: measured
            ? view.scrollSnapshot()
            : (saved?.scroll ?? view.scrollSnapshot()),
        });
      view.destroy();
      editorViewRef.current = null;
      consumedFocusRequestIdRef.current = null;
    };
  }, []);

  const contentModeKind = contentMode.kind;
  const bodyTitle = contentMode.kind === "body" ? contentMode.title : null;
  const rawTabDisplayWidth = syntax === null ? props.tabDisplayWidth : null;
  const checkableBlocksKey = createCtnEditorCheckableBlocksKey(checkableBlocks);

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
          ...createRuntimeOptions(props, checkableBlocks),
          checkableBlocks: [...checkableBlocks],
        }),
      ),
    });
  }, [
    bodyTitle,
    checkableBlocksKey,
    contentModeKind,
    syntax?.analysisKey,
    syntax?.presentationKey,
    rawTabDisplayWidth,
  ]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) return;
    view.dispatch({
      effects: ctnEditorReadOnlyCompartment.reconfigure(
        createCtnEditorReadOnlyExtensions(readOnly),
      ),
    });
  }, [readOnly]);

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
    <>
      <div
        className="source-editor"
        data-editor-mode={contentMode.kind}
        data-editor-read-only={readOnly ? "true" : "false"}
        ref={editorHostRef}
      />
      {widgets.portals}
    </>
  );
}
