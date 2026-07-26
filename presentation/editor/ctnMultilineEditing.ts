// SPDX-License-Identifier: GPL-3.0-or-later

import { Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
} from "@codemirror/view";
import {
  planCtnMultilineEdit,
  type CtnMultilineEditCommand,
} from "../../core/ctn/editing/multilineBlockEditPlanner";
import type {
  CtnSyntaxProfile,
} from "../../core/ctn/syntax/types";
import {
  createCtnMultilineCardExtensions,
  ctnMultilineCardDocumentChange,
} from "./ctnMultilineCardExtension";
import type {
  CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import type {
  CtnEditorParsePlugin,
} from "./ctnDecorations";

export function createCtnMultilineEditingExtensions(
  parsePlugin: CtnEditorParsePlugin,
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  const runCommand = (
    view: EditorView,
    command: CtnMultilineEditCommand,
  ) => {
    const parsed = view.plugin(parsePlugin);

    if (
      !parsed ||
      view.state.selection.ranges.length !== 1
    ) {
      return false;
    }
    const selection = view.state.selection.main;
    const plan = planCtnMultilineEdit({
      command,
      document: parsed.document,
      selection: {
        anchor: selection.anchor,
        head: selection.head,
      },
      source: view.state.doc.toString(),
      tabSize: view.state.tabSize,
    });

    if (!plan.handled) {
      return false;
    }
    if (plan.edits.length > 0) {
      view.dispatch({
        annotations: ctnMultilineCardDocumentChange.of(true),
        changes: plan.edits,
        selection: plan.selection,
      });
    }
    return true;
  };

  return [
    ...createCtnMultilineCardExtensions(
      parsePlugin,
      syntaxProfileRef,
      contentMode,
    ),
    Prec.high(
      keymap.of([
        {
          key: "Backspace",
          run: (view) =>
            runCommand(view, "delete-backward"),
        },
        {
          key: "Delete",
          run: (view) =>
            runCommand(view, "delete-forward"),
        },
        {
          key: "Enter",
          run: (view) => runCommand(view, "enter"),
        },
        {
          key: "Tab",
          run: (view) => runCommand(view, "indent"),
        },
        {
          key: "Shift-Tab",
          run: (view) => runCommand(view, "outdent"),
        },
      ]),
    ),
  ];
}
