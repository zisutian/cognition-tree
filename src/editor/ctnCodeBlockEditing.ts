import {
  EditorState,
  Prec,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type {
  CtnEditableBlock,
  CtnEditableDocument,
} from "../../ctn/parser/types";
import type { CtnEditorParsePlugin } from "./ctnDecorations";

function findMultilineBlockAtLine(
  document: CtnEditableDocument,
  lineNumber: number,
) {
  let low = 0;
  let high = document.blocks.length - 1;
  let candidate: CtnEditableBlock | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = document.blocks[middle];

    if (block.lineNumber <= lineNumber) {
      candidate = block;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return candidate?.role === "multiline" &&
    lineNumber <= candidate.lexicalEndLineNumber
    ? candidate
    : null;
}

function isMultilineContentLine(
  block: CtnEditableBlock,
  lineNumber: number,
) {
  return Boolean(
    block.multilineRange &&
    lineNumber >= block.multilineRange.contentStartLineNumber &&
    lineNumber <= block.multilineRange.contentEndLineNumber,
  );
}

function getLeadingWhitespace(text: string) {
  return text.match(/^\s*/)?.[0] ?? "";
}

function getSelectedLineNumbers(state: EditorState) {
  const selection = state.selection.main;
  const fromLine = state.doc.lineAt(selection.from);
  let toLine = state.doc.lineAt(selection.to);

  if (
    !selection.empty &&
    selection.to === toLine.from &&
    toLine.number > fromLine.number
  ) {
    toLine = state.doc.line(toLine.number - 1);
  }

  return Array.from(
    { length: toLine.number - fromLine.number + 1 },
    (_, index) => fromLine.number + index,
  );
}

function getOutdentLength(text: string, tabSize: number) {
  if (text.startsWith("\t")) {
    return 1;
  }

  const spaces = text.match(/^ +/)?.[0].length ?? 0;

  return Math.min(spaces, tabSize);
}

export function createCtnCodeBlockEnterTransaction(
  state: EditorState,
  document: CtnEditableDocument,
): TransactionSpec | null {
  if (
    state.selection.ranges.length !== 1 ||
    !state.selection.main.empty
  ) {
    return null;
  }

  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  const block = findMultilineBlockAtLine(document, line.number);

  if (
    !block ||
    block.multilineRange?.closingFenceLineNumber === line.number
  ) {
    return null;
  }

  const indentText = line.number === block.lineNumber
    ? `${block.indentText}\t`
    : getLeadingWhitespace(line.text) || `${block.indentText}\t`;
  const insert = `\n${indentText}`;

  return {
    changes: { from: cursor, insert, to: cursor },
    selection: { anchor: cursor + insert.length },
  };
}

export function createCtnCodeBlockIndentChanges(
  state: EditorState,
  document: CtnEditableDocument,
  direction: "indent" | "outdent",
): ChangeSpec[] | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }

  const selection = state.selection.main;
  const activeLine = state.doc.lineAt(selection.head);
  const block = findMultilineBlockAtLine(document, activeLine.number);

  if (!block || !isMultilineContentLine(block, activeLine.number)) {
    return null;
  }

  const selectedLineNumbers = getSelectedLineNumbers(state);

  if (
    selectedLineNumbers.some(
      (lineNumber) => !isMultilineContentLine(block, lineNumber),
    )
  ) {
    return [];
  }

  if (selection.empty && direction === "indent") {
    return [{ from: selection.head, insert: "\t", to: selection.head }];
  }

  return selectedLineNumbers.flatMap((lineNumber) => {
    const line = state.doc.line(lineNumber);

    if (direction === "indent") {
      return [{ from: line.from, insert: "\t", to: line.from }];
    }

    const removeLength = getOutdentLength(line.text, state.tabSize);

    return removeLength > 0
      ? [{ from: line.from, insert: "", to: line.from + removeLength }]
      : [];
  });
}

function createActiveCodeBlockDecorations(
  view: EditorView,
  parsePlugin: CtnEditorParsePlugin,
) {
  const parsed = view.plugin(parsePlugin);

  if (!parsed) {
    return Decoration.none;
  }

  const activeLine = view.state.doc.lineAt(view.state.selection.main.head);
  const block = findMultilineBlockAtLine(parsed.document, activeLine.number);

  if (!block) {
    return Decoration.none;
  }

  const decorations = [];
  const endLineNumber = Math.min(
    block.lexicalEndLineNumber,
    view.state.doc.lines,
  );

  for (
    let lineNumber = block.lineNumber;
    lineNumber <= endLineNumber;
    lineNumber += 1
  ) {
    decorations.push(
      Decoration.line({
        attributes: { class: "ctn-active-code-block" },
      }).range(view.state.doc.line(lineNumber).from),
    );
  }

  return Decoration.set(decorations, true);
}

export function createCtnCodeBlockEditingExtensions(
  parsePlugin: CtnEditorParsePlugin,
) {
  const activeCodeBlock = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = createActiveCodeBlockDecorations(view, parsePlugin);
      }

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) {
          return;
        }

        this.decorations = createActiveCodeBlockDecorations(
          update.view,
          parsePlugin,
        );
      }
    },
    { decorations: (plugin) => plugin.decorations },
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
    direction: "indent" | "outdent",
  ) => {
    const parsed = view.plugin(parsePlugin);
    const changes = parsed
      ? createCtnCodeBlockIndentChanges(
          view.state,
          parsed.document,
          direction,
        )
      : null;

    if (changes === null) {
      return false;
    }
    if (changes.length > 0) {
      view.dispatch({ changes });
    }
    return true;
  };

  return [
    activeCodeBlock,
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
