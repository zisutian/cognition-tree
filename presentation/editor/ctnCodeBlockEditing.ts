// SPDX-License-Identifier: GPL-3.0-or-later

import { Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
} from "@codemirror/view";
import type { CtnMultilineIndentDirection } from
  "../../core/ctn/parser/multilineBlockEdits";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";
import {
  createCtnCodeBlockEnterTransaction,
  createCtnCodeBlockIndentChanges,
  createCtnCodeBlockStructuralIndentChanges,
} from "./ctnCodeBlockCommands";
import { createCtnCodeCardExtensions } from "./ctnCodeCardExtension";
import { ctnCodeCardDocumentChange } from "./ctnCodeCardState";
import type { CtnEditorParsedContentMode } from "./ctnEditorContentMode";
import type { CtnEditorParsePlugin } from "./ctnDecorations";

export function createCtnCodeBlockEditingExtensions(
  parsePlugin: CtnEditorParsePlugin,
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  const codeCards = createCtnCodeCardExtensions(
    parsePlugin,
    syntaxProfileRef,
    contentMode,
  );
  const runEnter = (view: EditorView) => {
    const parsed = view.plugin(parsePlugin);
    const transaction = parsed
      ? createCtnCodeBlockEnterTransaction(view.state, parsed.document)
      : null;

    if (!transaction) {
      return false;
    }
    view.dispatch(transaction);
    return true;
  };
  const runIndent = (
    view: EditorView,
    direction: CtnMultilineIndentDirection,
  ) => {
    const parsed = view.plugin(parsePlugin);

    if (!parsed) {
      return false;
    }
    const ui = view.state.field(codeCards.uiField);
    const activeLine = view.state.doc.lineAt(
      view.state.selection.main.head,
    ).number;
    const structuralChanges =
      ui?.lineNumber === activeLine
        ? createCtnCodeBlockStructuralIndentChanges(
            view.state,
            parsed.document,
            direction,
          )
        : null;
    const changes = structuralChanges ??
      createCtnCodeBlockIndentChanges(
        view.state,
        parsed.document,
        direction,
      );

    if (changes === null) {
      return false;
    }
    if (changes.length > 0) {
      view.dispatch({
        annotations: ctnCodeCardDocumentChange.of(true),
        changes,
      });
    }
    return true;
  };

  return [
    ...codeCards.extensions,
    Prec.high(
      keymap.of([
        { key: "Enter", run: runEnter },
        { key: "Tab", run: (view) => runIndent(view, "indent") },
        {
          key: "Shift-Tab",
          run: (view) => runIndent(view, "outdent"),
        },
      ]),
    ),
  ];
}
