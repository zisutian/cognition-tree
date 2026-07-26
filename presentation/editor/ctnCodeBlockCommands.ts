// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorState,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import {
  createCtnMultilineStructuralIndentEdits,
  getCtnMultilineBodyBasePrefix,
  type CtnMultilineIndentDirection,
} from "../../core/ctn/parser/multilineBlockEdits";
import type {
  CtnClosedMultilineRange,
  CtnEditableBlock,
  CtnEditableDocument,
} from "../../core/ctn/parser/types";
import { ctnCodeCardDocumentChange } from "./ctnCodeCardState";

export type CtnClosedMultilineBlock = CtnEditableBlock & {
  marker: string;
  multilineRange: CtnClosedMultilineRange;
};

export function isClosedMultilineBlock(
  block: CtnEditableBlock,
): block is CtnClosedMultilineBlock {
  return block.role === "multiline" &&
    block.marker !== null &&
    block.multilineRange?.status === "closed";
}

export function findMultilineBlockAtLine(
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

  if (
    line.number === block.lineNumber &&
    block.marker &&
    block.multilineRange?.status === "unterminated" &&
    cursor === line.to
  ) {
    const bodyIndent = `${block.indentText}\t`;
    const bodyPrefix = `\n${bodyIndent}`;
    const insert = `${bodyPrefix}\n${block.indentText}${block.marker}`;

    return {
      annotations: ctnCodeCardDocumentChange.of(true),
      changes: { from: cursor, insert, to: cursor },
      selection: { anchor: cursor + bodyPrefix.length },
    };
  }

  if (line.number === block.lineNumber) {
    return null;
  }

  const indentText =
    getLeadingWhitespace(line.text) || `${block.indentText}\t`;
  const insert = `\n${indentText}`;

  return {
    changes: { from: cursor, insert, to: cursor },
    selection: { anchor: cursor + insert.length },
  };
}

export function createCtnCodeBlockIndentChanges(
  state: EditorState,
  document: CtnEditableDocument,
  direction: CtnMultilineIndentDirection,
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
  if (!selection.empty) {
    return [];
  }
  if (direction === "indent") {
    return [{ from: selection.head, insert: "\t", to: selection.head }];
  }
  const basePrefix = getCtnMultilineBodyBasePrefix(block, activeLine.text);
  const visibleText = activeLine.text.slice(basePrefix.length);
  const removeLength = getOutdentLength(visibleText, state.tabSize);
  const from = activeLine.from + basePrefix.length;

  return removeLength > 0
    ? [{ from, insert: "", to: from + removeLength }]
    : [];
}

export function createCtnCodeBlockStructuralIndentChanges(
  state: EditorState,
  document: CtnEditableDocument,
  direction: CtnMultilineIndentDirection,
): ChangeSpec[] | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }
  const activeLine = state.doc.lineAt(state.selection.main.head);
  const block = findMultilineBlockAtLine(document, activeLine.number);

  if (!block || block.lineNumber !== activeLine.number) {
    return null;
  }
  const lines = state.doc.toString().split("\n");

  return createCtnMultilineStructuralIndentEdits(
    block,
    lines,
    direction,
  ).map((edit) => {
    const line = state.doc.line(edit.lineNumber);

    return {
      from: line.from,
      insert: edit.nextPrefix,
      to: line.from + edit.previousPrefix.length,
    };
  });
}
