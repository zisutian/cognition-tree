// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnEditableBlock,
  CtnEditableDocument,
} from "../parser/types.ts";
import {
  createCtnMultilineSourceLayout,
  createCtnMultilineStructuralIndentEdits,
  createCtnSourceLines,
  findCtnMultilineBlockAtLine,
  getCtnSourceLine,
  getCtnSourceLineAt,
  isClosedCtnMultilineBlock,
  type CtnClosedMultilineBlock,
  type CtnMultilineSourceLayout,
  type CtnSourceLine,
} from "./multilineBlockLayout.ts";

export type CtnMultilineEditCommand =
  | "delete-backward"
  | "delete-forward"
  | "enter"
  | "indent"
  | "outdent";

export type CtnMultilineTextEdit = {
  from: number;
  insert: string;
  to: number;
};

export type CtnMultilineTextSelection = {
  anchor: number;
  head: number;
};

export type CtnMultilineEditPlan =
  | {
      handled: false;
    }
  | {
      edits: readonly CtnMultilineTextEdit[];
      handled: true;
      selection: CtnMultilineTextSelection;
    };

type SourceSelection = CtnMultilineTextSelection & {
  empty: boolean;
  from: number;
  to: number;
};

function normalizeSelection(
  selection: CtnMultilineTextSelection,
): SourceSelection {
  return {
    ...selection,
    empty: selection.anchor === selection.head,
    from: Math.min(selection.anchor, selection.head),
    to: Math.max(selection.anchor, selection.head),
  };
}

function getSelectedLineNumbers(
  lines: readonly CtnSourceLine[],
  selection: SourceSelection,
) {
  const fromLine = getCtnSourceLineAt(lines, selection.from);
  let toLine = getCtnSourceLineAt(lines, selection.to);

  if (!fromLine || !toLine) {
    return [];
  }
  if (
    !selection.empty &&
    selection.to === toLine.from &&
    toLine.number > fromLine.number
  ) {
    toLine = getCtnSourceLine(lines, toLine.number - 1) ?? toLine;
  }

  return Array.from(
    { length: toLine.number - fromLine.number + 1 },
    (_, index) => fromLine.number + index,
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

function mapPositionThroughEdits(
  position: number,
  edits: readonly CtnMultilineTextEdit[],
) {
  let delta = 0;

  for (const edit of edits) {
    if (position < edit.from) {
      return position + delta;
    }
    if (edit.from === edit.to && position === edit.from) {
      return position + delta + edit.insert.length;
    }
    if (position <= edit.to) {
      return edit.from + delta + edit.insert.length;
    }
    delta += edit.insert.length - (edit.to - edit.from);
  }

  return position + delta;
}

function handledPlan(
  selection: CtnMultilineTextSelection,
  edits: readonly CtnMultilineTextEdit[] = [],
  nextSelection?: CtnMultilineTextSelection,
): CtnMultilineEditPlan {
  const ordered = [...edits].sort((left, right) =>
    left.from - right.from || left.to - right.to
  );

  return {
    edits: ordered,
    handled: true,
    selection: nextSelection ?? {
      anchor: mapPositionThroughEdits(selection.anchor, ordered),
      head: mapPositionThroughEdits(selection.head, ordered),
    },
  };
}

function unhandledPlan(): CtnMultilineEditPlan {
  return { handled: false };
}

function isMultilineBodyLine(
  block: CtnEditableBlock,
  lineNumber: number,
) {
  return Boolean(
    block.multilineRange &&
    lineNumber >= block.multilineRange.contentStartLineNumber &&
    lineNumber <= block.multilineRange.contentEndLineNumber,
  );
}

function getTouchedMultilineBlocks(
  document: CtnEditableDocument,
  selectedLineNumbers: readonly number[],
) {
  const firstLineNumber = selectedLineNumbers[0];
  const lastLineNumber = selectedLineNumbers.at(-1);

  if (firstLineNumber === undefined || lastLineNumber === undefined) {
    return [];
  }

  return document.blocks.filter(
    (block) =>
      block.role === "multiline" &&
      block.lineNumber <= lastLineNumber &&
      block.lexicalEndLineNumber >= firstLineNumber,
  );
}

function isAdjacentFenceJoin({
  activeLine,
  command,
  document,
  selection,
}: {
  activeLine: CtnSourceLine;
  command: CtnMultilineEditCommand;
  document: CtnEditableDocument;
  selection: SourceSelection;
}) {
  if (!selection.empty) {
    return false;
  }
  if (
    command === "delete-forward" &&
    selection.head === activeLine.to
  ) {
    return document.blocks.some(
      (block) =>
        isClosedCtnMultilineBlock(block) &&
        block.lineNumber === activeLine.number + 1,
    );
  }
  if (
    command === "delete-backward" &&
    selection.head === activeLine.from
  ) {
    return document.blocks.some(
      (block) =>
        isClosedCtnMultilineBlock(block) &&
        block.lexicalEndLineNumber === activeLine.number - 1,
    );
  }

  return false;
}

function isSelectionInsideBody({
  block,
  layout,
  lines,
  selection,
}: {
  block: CtnEditableBlock;
  layout: CtnMultilineSourceLayout;
  lines: readonly CtnSourceLine[];
  selection: SourceSelection;
}) {
  const selectedLineNumbers = getSelectedLineNumbers(lines, selection);

  if (
    selectedLineNumbers.length === 0 ||
    selectedLineNumbers.some(
      (lineNumber) => !isMultilineBodyLine(block, lineNumber),
    )
  ) {
    return false;
  }
  const fromLine = getCtnSourceLineAt(lines, selection.from);
  const toLine = getCtnSourceLineAt(lines, selection.to);
  const fromBodyLine = layout.bodyLines.find(
    ({ number }) => number === fromLine?.number,
  );

  if (!fromLine || !toLine || !fromBodyLine) {
    return false;
  }
  if (selection.from < fromBodyLine.visibleFrom) {
    return false;
  }
  if (
    !selection.empty &&
    selection.to === toLine.from &&
    toLine.number > fromLine.number
  ) {
    return true;
  }
  const toBodyLine = layout.bodyLines.find(
    ({ number }) => number === toLine.number,
  );

  return Boolean(
    toBodyLine &&
    selection.to >= toBodyLine.visibleFrom &&
    selection.to <= toBodyLine.to,
  );
}

function planHeaderIndent({
  block,
  command,
  lines,
  selection,
  source,
}: {
  block: CtnClosedMultilineBlock;
  command: "indent" | "outdent";
  lines: readonly CtnSourceLine[];
  selection: CtnMultilineTextSelection;
  source: string;
}) {
  const prefixEdits = createCtnMultilineStructuralIndentEdits(
    block,
    source.split("\n"),
    command,
  );
  const edits = prefixEdits.flatMap((edit) => {
    const line = getCtnSourceLine(lines, edit.lineNumber);

    return line
      ? [{
          from: line.from,
          insert: edit.nextPrefix,
          to: line.from + edit.previousPrefix.length,
        }]
      : [];
  });

  return handledPlan(selection, edits);
}

function planHeaderRemoval({
  layout,
  lines,
  selection,
}: {
  layout: CtnMultilineSourceLayout;
  lines: readonly CtnSourceLine[];
  selection: CtnMultilineTextSelection;
}) {
  const closer = layout.closer;

  if (!closer) {
    return handledPlan(selection);
  }
  let from = layout.opener.from;
  let to = closer.to;

  if (closer.number < lines.length) {
    to = getCtnSourceLine(lines, closer.number + 1)?.from ?? to;
  } else if (layout.opener.number > 1) {
    from = getCtnSourceLine(lines, layout.opener.number - 1)?.to ?? from;
  }

  return handledPlan(
    selection,
    [{ from, insert: "", to }],
    { anchor: from, head: from },
  );
}

function planBodyEnter({
  block,
  layout,
  lines,
  selection,
}: {
  block: CtnEditableBlock;
  layout: CtnMultilineSourceLayout;
  lines: readonly CtnSourceLine[];
  selection: SourceSelection;
}) {
  if (!isSelectionInsideBody({
    block,
    layout,
    lines,
    selection,
  })) {
    return handledPlan(selection);
  }
  const activeLine = getCtnSourceLineAt(lines, selection.head);

  if (!activeLine) {
    return handledPlan(selection);
  }
  const indentText = getLeadingWhitespace(activeLine.text) ||
    `${block.indentText}\t`;
  const insert = `\n${indentText}`;

  return handledPlan(
    selection,
    [{
      from: selection.from,
      insert,
      to: selection.to,
    }],
    {
      anchor: selection.from + insert.length,
      head: selection.from + insert.length,
    },
  );
}

function planBodyIndent({
  block,
  command,
  layout,
  lines,
  selection,
  tabSize,
}: {
  block: CtnEditableBlock;
  command: "indent" | "outdent";
  layout: CtnMultilineSourceLayout;
  lines: readonly CtnSourceLine[];
  selection: SourceSelection;
  tabSize: number;
}) {
  if (!isSelectionInsideBody({
    block,
    layout,
    lines,
    selection,
  })) {
    return handledPlan(selection);
  }
  if (command === "indent" && selection.empty) {
    return handledPlan(selection, [{
      from: selection.head,
      insert: "\t",
      to: selection.head,
    }]);
  }
  const lineNumbers = getSelectedLineNumbers(lines, selection);
  const edits = lineNumbers.flatMap((lineNumber) => {
    const line = layout.bodyLines.find(
      ({ number }) => number === lineNumber,
    );

    if (!line) {
      return [];
    }
    if (command === "indent") {
      return [{
        from: line.visibleFrom,
        insert: "\t",
        to: line.visibleFrom,
      }];
    }
    const visibleText = line.text.slice(line.basePrefixLength);
    const removeLength = getOutdentLength(visibleText, tabSize);

    return removeLength > 0
      ? [{
          from: line.visibleFrom,
          insert: "",
          to: line.visibleFrom + removeLength,
        }]
      : [];
  });

  return handledPlan(selection, edits);
}

function planBodyDeletion({
  block,
  command,
  layout,
  lines,
  selection,
}: {
  block: CtnEditableBlock;
  command: "delete-backward" | "delete-forward";
  layout: CtnMultilineSourceLayout;
  lines: readonly CtnSourceLine[];
  selection: SourceSelection;
}) {
  if (!selection.empty) {
    if (!isSelectionInsideBody({
      block,
      layout,
      lines,
      selection,
    })) {
      return handledPlan(selection);
    }

    return handledPlan(
      selection,
      [{
        from: selection.from,
        insert: "",
        to: selection.to,
      }],
      { anchor: selection.from, head: selection.from },
    );
  }
  const activeLine = layout.bodyLines.find(
    ({ number }) =>
      number === getCtnSourceLineAt(lines, selection.head)?.number,
  );

  if (!activeLine) {
    return handledPlan(selection);
  }
  if (command === "delete-backward") {
    if (selection.head > activeLine.visibleFrom) {
      return unhandledPlan();
    }
    if (
      selection.head < activeLine.visibleFrom ||
      activeLine.number ===
        block.multilineRange?.contentStartLineNumber
    ) {
      return handledPlan(selection);
    }
    const previousLine = layout.bodyLines.find(
      ({ number }) => number === activeLine.number - 1,
    );

    if (!previousLine) {
      return handledPlan(selection);
    }

    return handledPlan(
      selection,
      [{
        from: previousLine.to,
        insert: "",
        to: activeLine.visibleFrom,
      }],
      { anchor: previousLine.to, head: previousLine.to },
    );
  }
  if (selection.head < activeLine.to) {
    return unhandledPlan();
  }
  if (
    selection.head > activeLine.to ||
    activeLine.number === block.multilineRange?.contentEndLineNumber
  ) {
    return handledPlan(selection);
  }
  const nextLine = layout.bodyLines.find(
    ({ number }) => number === activeLine.number + 1,
  );

  if (!nextLine) {
    return handledPlan(selection);
  }

  return handledPlan(
    selection,
    [{
      from: activeLine.to,
      insert: "",
      to: nextLine.visibleFrom,
    }],
    { anchor: activeLine.to, head: activeLine.to },
  );
}

export function planCtnMultilineEdit({
  command,
  document,
  selection: inputSelection,
  source,
  tabSize,
}: {
  command: CtnMultilineEditCommand;
  document: CtnEditableDocument;
  selection: CtnMultilineTextSelection;
  source: string;
  tabSize: number;
}): CtnMultilineEditPlan {
  const lines = createCtnSourceLines(source);
  const selection = normalizeSelection(inputSelection);
  const activeLine = getCtnSourceLineAt(lines, selection.head);

  if (!activeLine) {
    return unhandledPlan();
  }
  const block = findCtnMultilineBlockAtLine(
    document,
    activeLine.number,
  );
  const selectedLineNumbers = getSelectedLineNumbers(lines, selection);

  if (!block || !block.multilineRange || block.marker === null) {
    if (
      getTouchedMultilineBlocks(
        document,
        selectedLineNumbers,
      ).length > 0 ||
      isAdjacentFenceJoin({
        activeLine,
        command,
        document,
        selection,
      })
    ) {
      return handledPlan(selection);
    }

    return unhandledPlan();
  }
  const layout = createCtnMultilineSourceLayout(source, block);

  if (!layout) {
    return unhandledPlan();
  }
  const onHeader = activeLine.number === block.lineNumber;
  const selectionOnlyTouchesHeader = selectedLineNumbers.every(
    (lineNumber) => lineNumber === block.lineNumber,
  );

  if (onHeader && block.multilineRange.status === "unterminated") {
    if (
      command === "enter" &&
      selection.empty &&
      selection.head === layout.opener.to
    ) {
      const bodyPrefix = `\n${block.indentText}\t`;
      const insert =
        `${bodyPrefix}\n${block.indentText}${block.marker}`;
      const nextPosition = selection.head + bodyPrefix.length;

      return handledPlan(
        selection,
        [{
          from: selection.head,
          insert,
          to: selection.head,
        }],
        { anchor: nextPosition, head: nextPosition },
      );
    }

    return unhandledPlan();
  }
  if (onHeader && isClosedCtnMultilineBlock(block)) {
    if (!selectionOnlyTouchesHeader) {
      return handledPlan(selection);
    }
    if (command === "indent" || command === "outdent") {
      return planHeaderIndent({
        block,
        command,
        lines,
        selection,
        source,
      });
    }
    if (
      command === "delete-backward" ||
      command === "delete-forward"
    ) {
      return planHeaderRemoval({
        layout,
        lines,
        selection,
      });
    }

    return handledPlan(selection);
  }
  if (
    layout.closer &&
    activeLine.number === layout.closer.number
  ) {
    return handledPlan(selection);
  }
  if (!isMultilineBodyLine(block, activeLine.number)) {
    return unhandledPlan();
  }
  if (command === "enter") {
    return planBodyEnter({
      block,
      layout,
      lines,
      selection,
    });
  }
  if (command === "indent" || command === "outdent") {
    return planBodyIndent({
      block,
      command,
      layout,
      lines,
      selection,
      tabSize,
    });
  }

  return planBodyDeletion({
    block,
    command,
    layout,
    lines,
    selection,
  });
}
