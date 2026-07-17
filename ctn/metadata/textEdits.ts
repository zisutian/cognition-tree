// SPDX-License-Identifier: GPL-3.0-or-later

export type CtnTextEdit = {
  from: number;
  insertedText: string;
  to: number;
};

export type CtnEditableSourceChange = {
  edits: readonly CtnTextEdit[];
  source: string;
};

export function applyCtnTextEdits(
  previousSource: string,
  edits: readonly CtnTextEdit[],
) {
  let cursor = 0;
  let nextSource = "";

  for (const edit of edits) {
    if (
      !Number.isInteger(edit.from) ||
      !Number.isInteger(edit.to) ||
      edit.from < cursor ||
      edit.to < edit.from ||
      edit.to > previousSource.length
    ) {
      throw new Error(`Invalid CTN text edit range ${edit.from}-${edit.to}.`);
    }

    nextSource += previousSource.slice(cursor, edit.from);
    nextSource += edit.insertedText;
    cursor = edit.to;
  }

  return nextSource + previousSource.slice(cursor);
}

export function assertCtnEditableSourceChange(
  previousSource: string,
  change: CtnEditableSourceChange,
) {
  const appliedSource = applyCtnTextEdits(previousSource, change.edits);

  if (appliedSource !== change.source) {
    throw new Error("CTN text edits do not produce the supplied source.");
  }
}

export function mapCtnTextOffset(
  offset: number,
  edits: readonly CtnTextEdit[],
) {
  let delta = 0;

  for (const edit of edits) {
    if (offset < edit.from) {
      break;
    }

    if (offset > edit.to || (offset === edit.to && edit.from !== edit.to)) {
      delta += edit.insertedText.length - (edit.to - edit.from);
      continue;
    }

    if (offset === edit.from && edit.from === edit.to) {
      return offset + delta + edit.insertedText.length;
    }

    return edit.from + delta + edit.insertedText.length;
  }

  return offset + delta;
}
